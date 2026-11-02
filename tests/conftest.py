"""Shared fixtures: one PostgreSQL 18 container per test session, migrated and seeded."""

from __future__ import annotations

from collections.abc import Iterator

import psycopg
import pytest

PG_IMAGE = "pgvector/pgvector:pg18"
APP_PASSWORD = "app-test-password"


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Mark tests by folder, so ``-m "not legacy"`` and friends work without boilerplate."""
    for item in items:
        parts = item.path.parts
        if "legacy" in parts:
            item.add_marker(pytest.mark.legacy)
        elif "db" in parts or "api" in parts:
            item.add_marker(pytest.mark.db)


@pytest.fixture(scope="session")
def pg_url() -> Iterator[str]:
    from testcontainers.community.postgres import PostgresContainer

    with PostgresContainer(PG_IMAGE, driver=None) as pg:
        yield pg.get_connection_url()


@pytest.fixture(scope="session")
def seeded(pg_url: str) -> str:
    """The session database, migrated and loaded with the ``tiny`` dataset."""
    from vamusic.db.migrations import migrate, set_app_password
    from vamusic.seed.generator import generate
    from vamusic.seed.loader import load

    with psycopg.connect(pg_url) as conn:
        migrate(conn)
        set_app_password(conn, APP_PASSWORD)
        load(conn, generate("tiny"))
    return pg_url


@pytest.fixture(scope="session")
def app_url(seeded: str) -> str:
    """The same database, as the API's login role."""
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    params = conninfo_to_dict(seeded)
    params.update(user="vamusic_app", password=APP_PASSWORD)
    return make_conninfo(**params)
