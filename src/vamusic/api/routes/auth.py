"""Sign-up, sign-in and the signed-in listener's profile."""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from vamusic.api import schemas
from vamusic.api.auth import Principal, hash_password, issue_token, verify_password
from vamusic.api.deps import AppSession, CurrentUser, DbSession, Row, get_settings
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
    """Create a listener account through a `SECURITY DEFINER` function; returns a session token."""
    row = db.q1(
        "auth.register",
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
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
    """Look up the account through a `SECURITY DEFINER` function and check its bcrypt hash."""
    row = db.q1("auth.login_lookup", login=body.login)
    ok = verify_password(body.password, row["password_hash"] if row else None)
    if not row or not ok or not row["is_active"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong username or password")
    db.q("auth.touch_login", user_id=row["user_id"])
    principal = Principal(row["user_id"], str(row["public_id"]), row["username"], row["role"])
    return _session(principal, row["display_name"], settings)


@router.get("/me", response_model=schemas.Me)
def me(db: DbSession, _user: CurrentUser) -> Row:
    """The signed-in listener's profile, tier, plan and listening totals."""
    row = db.q1("auth.me")
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
    return row


@router.patch("/me", response_model=schemas.Me)
def update_me(body: schemas.ProfileIn, db: DbSession, _user: CurrentUser) -> Row:
    """Change the signed-in listener's display name or country."""
    changes = body.model_dump(exclude_unset=True)
    if changes:
        db.q(
            "auth.update_me",
            display_name=changes.get("display_name"),
            country=changes.get("country"),
        )
    row = db.q1("auth.me")
    assert row is not None
    return row
