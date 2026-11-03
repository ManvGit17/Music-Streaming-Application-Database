"""Apply the numbered SQL files in ``db/migrations`` exactly once each, in order.

Each file runs in its own transaction. Its SHA-256 is recorded so that editing a migration
after it has been applied is detected instead of silently ignored.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import psycopg
from psycopg import sql

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "db" / "migrations"
_NAME = re.compile(r"^(\d{4})_([a-z0-9_]+)\.sql$")


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    path: Path

    @property
    def sql(self) -> str:
        return self.path.read_text(encoding="utf-8")

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.path.read_bytes()).hexdigest()


class MigrationError(RuntimeError):
    pass


def discover(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    found = []
    for path in sorted(directory.glob("*.sql")):
        match = _NAME.match(path.name)
        if not match:
            raise MigrationError(f"bad migration file name: {path.name}")
        found.append(Migration(int(match[1]), match[2], path))
    versions = [m.version for m in found]
    if versions != list(range(1, len(found) + 1)):
        raise MigrationError(f"migration versions must be 1..n with no gaps, got {versions}")
    return found


_BOOKKEEPING = """
CREATE SCHEMA IF NOT EXISTS vamusic_meta;
CREATE TABLE IF NOT EXISTS vamusic_meta.migration (
    version    integer PRIMARY KEY,
    name       text NOT NULL,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);
"""


def migrate(conn: psycopg.Connection, directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    """Apply pending migrations; return the ones applied. ``conn`` must not be in autocommit."""
    conn.execute(_BOOKKEEPING)
    conn.commit()

    applied = {
        version: checksum
        for version, checksum in conn.execute(
            "SELECT version, checksum FROM vamusic_meta.migration"
        ).fetchall()
    }
    done: list[Migration] = []
    for m in discover(directory):
        if m.version in applied:
            if applied[m.version] != m.checksum:
                raise MigrationError(
                    f"{m.path.name} changed after it was applied; add a new migration instead"
                )
            continue
        with conn.transaction():
            conn.execute(m.sql.encode())
            conn.execute(
                "INSERT INTO vamusic_meta.migration (version, name, checksum) VALUES (%s, %s, %s)",
                (m.version, m.name, m.checksum),
            )
        done.append(m)
    conn.commit()
    return done


def set_app_password(conn: psycopg.Connection, password: str) -> None:
    """Set the login password for the API role (kept out of the migrations on purpose)."""
    conn.execute(sql.SQL("ALTER ROLE vamusic_app PASSWORD {}").format(sql.Literal(password)))
    conn.commit()
