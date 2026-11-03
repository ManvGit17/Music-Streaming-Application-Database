"""Password hashing and signed access tokens."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

Role = Literal["listener", "admin"]

# Compared against when a login name doesn't exist, so a miss costs the same time as a hit.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equaliser", bcrypt.gensalt(10))


@dataclass(frozen=True)
class Principal:
    user_id: int
    public_id: str
    username: str
    role: Role

    @property
    def db_role(self) -> str:
        return "vamusic_admin" if self.role == "admin" else "vamusic_listener"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()


def verify_password(password: str, hashed: str | None) -> bool:
    if hashed is None:
        bcrypt.checkpw(password.encode(), _DUMMY_HASH)
        return False
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def issue_token(principal: Principal, secret: str, ttl: timedelta) -> str:
    now = datetime.now(UTC)
    claims = {
        "sub": principal.public_id,
        "uid": principal.user_id,
        "name": principal.username,
        "role": principal.role,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def read_token(token: str, secret: str) -> Principal | None:
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], options={"require": ["exp"]})
    except jwt.PyJWTError:
        return None
    role = claims.get("role")
    if role not in ("listener", "admin"):
        return None
    return Principal(int(claims["uid"]), str(claims["sub"]), str(claims["name"]), role)
