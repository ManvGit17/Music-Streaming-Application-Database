"""API tests run against their own database in the session container.

API requests commit, so they get a separate database from the rolled-back DB tests.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from tests.conftest import APP_PASSWORD


@pytest.fixture(scope="session")
def api_urls(pg_url: str) -> tuple[str, str]:
    from vamusic.db.migrations import migrate, set_app_password
    from vamusic.seed.generator import generate
    from vamusic.seed.loader import load

    with psycopg.connect(pg_url, autocommit=True) as admin:
        admin.execute("DROP DATABASE IF EXISTS vamusic_api")
        admin.execute("CREATE DATABASE vamusic_api")
    params = conninfo_to_dict(pg_url)
    owner = make_conninfo(**{**params, "dbname": "vamusic_api"})
    app = make_conninfo(
        **{**params, "dbname": "vamusic_api", "user": "vamusic_app", "password": APP_PASSWORD}
    )
    with psycopg.connect(owner) as conn:
        migrate(conn)
        set_app_password(conn, APP_PASSWORD)
        load(conn, generate("tiny"))
    return owner, app


@pytest.fixture(scope="session")
def client(api_urls: tuple[str, str]) -> Iterator[TestClient]:
    from vamusic.api.app import create_app
    from vamusic.config import Settings

    owner, app = api_urls
    settings = Settings(
        database_url=owner,
        app_database_url=app,
        jwt_secret="test-secret-that-is-at-least-32-bytes-long",
    )
    with TestClient(create_app(settings)) as c:
        yield c


def login(client: TestClient, name: str, password: str = "vamusic") -> dict[str, str]:
    res = client.post("/api/auth/login", json={"login": name, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture(scope="session")
def john(client: TestClient) -> dict[str, str]:
    return login(client, "john_doe")


@pytest.fixture(scope="session")
def admin(client: TestClient) -> dict[str, str]:
    return login(client, "admin")


@pytest.fixture
def newbie(client: TestClient) -> dict[str, str]:
    """A brand-new listener, so tests that write don't disturb each other."""
    name = f"t_{uuid.uuid4().hex[:10]}"
    res = client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": "correct horse"},
    )
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}
