"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import errors
from psycopg_pool import ConnectionPool

from vamusic import __version__
from vamusic.api.routes import admin, auth, catalog, library, meta, playlists
from vamusic.config import Settings, get_settings

# Database errors that are the client's fault, mapped to HTTP statuses.
_DB_ERRORS: list[tuple[type[psycopg.Error], int, str]] = [
    (errors.UniqueViolation, 409, "already exists"),
    (errors.ExclusionViolation, 409, "conflicts with an existing record"),
    (errors.ForeignKeyViolation, 422, "refers to something that doesn't exist"),
    (errors.CheckViolation, 422, "value not allowed"),
    (errors.InvalidParameterValue, 422, "invalid value"),
    (errors.NoDataFound, 404, "not found"),
    (errors.InsufficientPrivilege, 403, "not allowed"),
]


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        pool = ConnectionPool(
            settings.app_database_url,
            min_size=1,
            max_size=settings.pool_max_size,
            open=False,
        )
        pool.open(wait=True, timeout=30)
        app.state.pool = pool
        try:
            yield
        finally:
            pool.close()

    app = FastAPI(
        title="VaMusic API",
        version=__version__,
        description=(
            "A database-first music streaming API on PostgreSQL 18. Add `?lens=1` to any "
            "request to see the SQL it ran, or `?lens=plan` for execution plans too.\n\n"
            "Sign in with `POST /api/auth/login` and send the token it returns as "
            "`Authorization: Bearer <token>`. Every demo account's password is `vamusic`."
        ),
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(psycopg.Error)
    async def database_error(_request: Request, exc: psycopg.Error) -> JSONResponse:
        for kind, code, message in _DB_ERRORS:
            if isinstance(exc, kind):
                detail = exc.diag.message_primary or message
                return JSONResponse({"detail": detail}, status_code=code)
        raise exc

    for module in (auth, catalog, library, playlists, admin, meta):
        app.include_router(module.router)
    return app
