"""Database test helpers. Every test runs in a transaction that is rolled back afterwards."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import psycopg
import pytest
from psycopg.rows import dict_row

pytestmark = pytest.mark.db


class Db:
    def __init__(self, conn: psycopg.Connection[dict[str, Any]]) -> None:
        self.conn = conn

    def rows(self, query: str, params: Any = None) -> list[dict[str, Any]]:
        cur = self.conn.execute(query.encode(), params)
        return cur.fetchall() if cur.description else []

    def value(self, query: str, params: Any = None) -> Any:
        row = self.conn.execute(query.encode(), params).fetchone()
        assert row is not None
        return next(iter(row.values()))

    def act_as(self, role: str, user_id: int | None = None) -> None:
        """Switch this transaction to a request role, the way the API does."""
        self.conn.execute(f"SET LOCAL ROLE {role}".encode())
        self.conn.execute(
            "SELECT set_config('vamusic.user_id', %s, true)",
            ("" if user_id is None else str(user_id),),
        )

    def reset_role(self) -> None:
        self.conn.execute(b"RESET ROLE")
        self.conn.execute("SELECT set_config('vamusic.user_id', '', true)")

    def fails(self, query: str, params: Any = None) -> psycopg.Error:
        """Run a statement expected to fail, inside a savepoint so the test can continue."""
        try:
            with self.conn.transaction():
                self.conn.execute(query.encode(), params)
        except psycopg.Error as exc:
            return exc
        raise AssertionError(f"expected failure: {query}")


@pytest.fixture
def db(seeded: str) -> Iterator[Db]:
    with psycopg.connect(seeded, row_factory=dict_row) as conn:
        conn.execute("SET search_path = vamusic, public")
        with conn.transaction(force_rollback=True):
            yield Db(conn)
