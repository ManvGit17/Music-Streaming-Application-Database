"""Sign-up, sign-in and the signed-in listener's profile."""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from vamusic.api import schemas
from vamusic.api.auth import Principal, hash_password, issue_token, verify_password
from vamusic.api.deps import AppSession, CurrentUser, DbSession, get_settings
from vamusic.api.queries import Row
from vamusic.api.routing import LensRoute
from vamusic.config import Settings

router = APIRouter(prefix="/api", tags=["auth"], route_class=LensRoute)


def _session(principal: Principal, display_name: str | None, settings: Settings) -> Row:
    token = issue_token(
        principal,
        settings.jwt_secret.get_secret_value(),
        timedelta(minutes=settings.token_ttl_minutes),
    )
    return {
        "token": token,
        "role": principal.role,
        "user": {
            "id": principal.public_id,
            "username": principal.username,
            "display_name": display_name,
        },
    }


@router.post("/auth/register", response_model=schemas.Session, status_code=201)
def register(
    body: schemas.RegisterIn,
    db: AppSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Row:
    row = db.one(
        "SELECT * FROM vamusic.register_listener(%s, %s, %s, %s)",
        (body.username, body.email, hash_password(body.password), body.display_name),
    )
    assert row is not None
    principal = Principal(row["user_id"], str(row["public_id"]), body.username, "listener")
    return _session(principal, body.display_name or body.username, settings)


@router.post("/auth/login", response_model=schemas.Session)
def login(
    body: schemas.LoginIn,
    db: AppSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Row:
    row = db.one("SELECT * FROM vamusic.auth_lookup(%s)", (body.login,))
    ok = verify_password(body.password, row["password_hash"] if row else None)
    if not row or not ok or not row["is_active"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong username or password")
    db.all("SELECT vamusic.auth_touch_login(%s)", (row["user_id"],))
    principal = Principal(row["user_id"], str(row["public_id"]), row["username"], row["role"])
    return _session(principal, row["display_name"], settings)


_ME = """
    SELECT u.public_id AS id, u.username, u.display_name, u.country, u.created_at AS joined,
           a.email, a.role,
           vamusic.listener_tier(u.user_id) AS tier,
           coalesce(s.play_count, 0) AS plays,
           coalesce(s.ms_played, 0) / 60000 AS minutes,
           (SELECT p.name FROM vamusic.subscription sub JOIN vamusic.plan p USING (plan_id)
            WHERE sub.user_id = u.user_id AND sub.status = 'active'
              AND sub.active_during @> current_date) AS plan
    FROM vamusic.app_user u
    JOIN vamusic.user_account a USING (user_id)
    LEFT JOIN vamusic.user_stat s USING (user_id)
    WHERE u.user_id = vamusic.current_user_id()
"""


@router.get("/me", response_model=schemas.Me)
def me(db: DbSession, _user: CurrentUser) -> Row:
    row = db.one(_ME)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
    return row


@router.patch("/me", response_model=schemas.Me)
def update_me(body: schemas.ProfileIn, db: DbSession, _user: CurrentUser) -> Row:
    changes = body.model_dump(exclude_unset=True)
    if changes:
        db.all(
            "UPDATE vamusic.app_user SET display_name = coalesce(%(display_name)s, display_name),"
            " country = coalesce(%(country)s, country) WHERE user_id = vamusic.current_user_id()",
            {"display_name": changes.get("display_name"), "country": changes.get("country")},
        )
    row = db.one(_ME)
    assert row is not None
    return row
