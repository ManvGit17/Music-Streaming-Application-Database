"""Request-scoped database access.

Every request gets one transaction on a pooled connection. Before any query runs, the
transaction switches to the request's database role and records who is signed in:

    SET LOCAL ROLE vamusic_listener;
    SELECT set_config('vamusic.user_id', '42', true);

Both settings are transaction-local, so they vanish when the connection goes back to the pool.
Row-level security in the database does the rest.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Annotated, Any

import psycopg
from fastapi import Depends, HTTPException, Request, status
from psycopg_pool import ConnectionPool

from vamusic.api import lens
from vamusic.api.auth import Principal, read_token
from vamusic.config import Settings
from vamusic.db import queries

#: A database row or a JSON object on its way to becoming a response model.
Row = dict[str, Any]


class Db:
    """Query helper bound to one transaction, recording into the SQL Lens if enabled.

    Routes run named queries from ``db/queries`` (the same files the web demo uses) with
    ``q``/``q1``/``qv``. ``all`` runs raw SQL and is reserved for request setup.
    """

    def __init__(self, conn: psycopg.Connection[Any], trace: lens.Trace | None) -> None:
        self.conn = conn
        self.trace = trace

    def all(self, sql: str, params: Any = None) -> list[Row]:
        return lens.run(self.conn, self.trace, sql, params)

    # The query name is positional-only so queries may have a parameter called "name".
    def q(self, query_name: str, /, **params: Any) -> list[Row]:
        query = queries.get(query_name)
        missing = set(query.params) - params.keys()
        if missing:
            raise TypeError(f"{query_name} needs {sorted(missing)}")
        values = {k: params[k] for k in query.params}
        return lens.run(self.conn, self.trace, query.psycopg, values, name=query_name)

    def q1(self, query_name: str, /, **params: Any) -> Row | None:
        rows = self.q(query_name, **params)
        return rows[0] if rows else None

    def qv(self, query_name: str, /, **params: Any) -> Any:
        row = self.q1(query_name, **params)
        return None if row is None else next(iter(row.values()))


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_pool(request: Request) -> ConnectionPool:
    pool: ConnectionPool = request.app.state.pool
    return pool


def lens_mode(request: Request, settings: Annotated[Settings, Depends(get_settings)]) -> None:
    """Start a trace if the client asked for one with ?lens=1 or ?lens=plan."""
    value = request.query_params.get("lens", "").lower()
    if not settings.lens_enabled or value in ("", "0", "false", "off"):
        return
    request.state.lens = lens.Trace(mode="plan" if value == "plan" else "trace")


def optional_principal(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> Principal | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    principal = read_token(token, settings.jwt_secret.get_secret_value())
    if principal is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    return principal


def require_principal(
    principal: Annotated[Principal | None, Depends(optional_principal)],
) -> Principal:
    if principal is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "sign in required", {"WWW-Authenticate": "Bearer"}
        )
    return principal


def require_admin(principal: Annotated[Principal, Depends(require_principal)]) -> Principal:
    if principal.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
    return principal


def _session(role: str | None) -> Callable[..., Iterator[Db]]:
    def dependency(
        request: Request,
        pool: Annotated[ConnectionPool, Depends(get_pool)],
        principal: Annotated[Principal | None, Depends(optional_principal)],
        _lens: Annotated[None, Depends(lens_mode)],
    ) -> Iterator[Db]:
        trace: lens.Trace | None = getattr(request.state, "lens", None)
        with pool.connection() as conn, conn.transaction():
            db = Db(conn, trace)
            db_role = role or (principal.db_role if principal else "vamusic_anon")
            if db_role != "vamusic_app":
                db.all(f"SET LOCAL ROLE {db_role}")
            db.all(
                "SELECT set_config('vamusic.user_id', %s, true)",
                ("" if principal is None else str(principal.user_id),),
            )
            if trace:
                trace.role = db_role
                trace.user_id = principal.user_id if principal else None
            yield db

    return dependency


#: A transaction running as the caller's role (anon, listener or admin).
db_session = _session(None)
#: A transaction running as the API's own login role, for sign-in and sign-up only.
app_session = _session("vamusic_app")

DbSession = Annotated[Db, Depends(db_session)]
AppSession = Annotated[Db, Depends(app_session)]
CurrentUser = Annotated[Principal, Depends(require_principal)]
MaybeUser = Annotated[Principal | None, Depends(optional_principal)]
AdminUser = Annotated[Principal, Depends(require_admin)]
