"""Runtime configuration, read from environment variables (prefix ``VAMUSIC_``)."""

from __future__ import annotations

import secrets
from functools import lru_cache

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VAMUSIC_", env_file=".env", extra="ignore")

    #: Connection used for migrations and seeding. Needs to own the schema.
    database_url: str = "postgresql://postgres:postgres@localhost:5432/vamusic"
    #: Connection the API uses: the ``vamusic_app`` login role, which owns nothing.
    app_database_url: str = "postgresql://vamusic_app:vamusic_app@localhost:5432/vamusic"

    #: Signing key for access tokens. A random one is generated if unset, which logs everyone
    #: out on restart; set it explicitly anywhere that matters.
    jwt_secret: SecretStr = Field(default_factory=lambda: SecretStr(secrets.token_urlsafe(32)))
    token_ttl_minutes: int = 60 * 24

    cors_origins: list[str] = ["http://localhost:5173"]
    #: Allow clients to request query traces (statements, timings, plans) with ``?lens=1``.
    lens_enabled: bool = True
    pool_max_size: int = 10

    @field_validator("jwt_secret")
    @classmethod
    def _long_enough(cls, value: SecretStr) -> SecretStr:
        # RFC 7518 3.2: an HS256 key must be at least as long as the hash output.
        if len(value.get_secret_value().encode()) < 32:
            raise ValueError("VAMUSIC_JWT_SECRET must be at least 32 bytes")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
