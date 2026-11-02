"""Fixtures for characterization tests of the original MySQL schema."""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
LEGACY_APP = ROOT / "legacy" / "tkinter"
SCHEMA = ROOT / "legacy" / "mysql" / "vamusic_v2.sql"

sys.path.insert(0, str(LEGACY_APP))

mysql_connector = pytest.importorskip("mysql.connector")
MySqlContainer = pytest.importorskip("testcontainers.mysql").MySqlContainer

from sql_script import split_mysql_script  # noqa: E402

ROOT_PASSWORD = "legacy-test"


@pytest.fixture(scope="session")
def mysql_server() -> Iterator[dict[str, Any]]:
    with MySqlContainer(
        "mysql:8.4", username="root", password=ROOT_PASSWORD, root_password=ROOT_PASSWORD
    ) as server:
        yield {
            "host": server.get_container_host_ip(),
            "port": int(server.get_exposed_port(3306)),
            "user": "root",
            "password": ROOT_PASSWORD,
        }


def load_schema(cfg: dict[str, Any]) -> None:
    conn = mysql_connector.connect(**cfg, autocommit=True)
    cur = conn.cursor()
    try:
        for stmt in split_mysql_script(SCHEMA.read_text(encoding="utf-8")):
            cur.execute(stmt)
            if cur.with_rows:
                cur.fetchall()
    finally:
        cur.close()
        conn.close()


class Db:
    """Small helper over a dictionary cursor."""

    def __init__(self, cfg: dict[str, Any]) -> None:
        self.conn = mysql_connector.connect(**cfg, database="vamusic", autocommit=True)

    def rows(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        cur = self.conn.cursor(dictionary=True)
        try:
            cur.execute(sql, params)
            return list(cur.fetchall()) if cur.with_rows else []
        finally:
            cur.close()

    def value(self, sql: str, params: tuple[Any, ...] = ()) -> Any:
        row = self.rows(sql, params)[0]
        return next(iter(row.values()))

    def call(self, proc: str, params: tuple[Any, ...] = ()) -> list[list[dict[str, Any]]]:
        cur = self.conn.cursor(dictionary=True)
        try:
            cur.callproc(proc, params)
            return [list(r.fetchall()) for r in cur.stored_results()]
        finally:
            cur.close()

    def close(self) -> None:
        self.conn.close()


@pytest.fixture
def db(mysql_server: dict[str, Any]) -> Iterator[Db]:
    """A freshly imported `vamusic` database for every test."""
    load_schema(mysql_server)
    handle = Db(mysql_server)
    yield handle
    handle.close()
