"""Migrations, catalog constraints and PostgreSQL 18 features."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import psycopg
import pytest

from vamusic.db.migrations import MIGRATIONS_DIR, MigrationError, discover, migrate


def test_migrations_are_numbered_without_gaps():
    versions = [m.version for m in discover()]
    assert versions == list(range(1, len(versions) + 1))


def test_migrate_is_idempotent(seeded):
    with psycopg.connect(seeded) as conn:
        assert migrate(conn) == []


def test_editing_an_applied_migration_is_detected(seeded, tmp_path: Path):
    copy = tmp_path / "migrations"
    shutil.copytree(MIGRATIONS_DIR, copy)
    first = sorted(copy.glob("0001_*.sql"))[0]
    first.write_text(first.read_text(encoding="utf-8") + "\n-- edited\n", encoding="utf-8")
    with psycopg.connect(seeded) as conn, pytest.raises(MigrationError, match="changed after"):
        migrate(conn, copy)


def test_gaps_in_migration_numbers_are_rejected(tmp_path: Path):
    (tmp_path / "0001_a.sql").write_text("SELECT 1;")
    (tmp_path / "0003_c.sql").write_text("SELECT 1;")
    with pytest.raises(MigrationError, match="no gaps"):
        discover(tmp_path)


def test_public_ids_are_uuidv7(db):
    public_id = db.value("SELECT public_id FROM track ORDER BY track_id LIMIT 1")
    assert uuid.UUID(str(public_id)).version == 7


def test_virtual_generated_column(db):
    row = db.rows("SELECT duration_ms, duration_seconds FROM track WHERE track_id = 1")[0]
    assert row["duration_seconds"] == row["duration_ms"] // 1000
    kind = db.value(
        "SELECT attgenerated FROM pg_attribute "
        "WHERE attrelid = 'vamusic.track'::regclass AND attname = 'duration_seconds'"
    )
    assert kind == "v"  # virtual, computed on read


def test_track_numbers_are_unique_per_disc(db):
    err = db.fails(
        "INSERT INTO track (album_id, title, track_number, duration_ms) VALUES (1, 'Dup', 1, 60000)"
    )
    assert isinstance(err, psycopg.errors.UniqueViolation)


@pytest.mark.parametrize(
    ("column", "value"),
    [("duration_ms", 10), ("title", "   ")],
)
def test_track_check_constraints(db, column, value):
    values = {"album_id": 1, "title": "Ok", "duration_ms": 60000, column: value}
    err = db.fails(
        "INSERT INTO track (album_id, title, duration_ms) VALUES (%(album_id)s, %(title)s, "
        "%(duration_ms)s)",
        values,
    )
    assert isinstance(err, psycopg.errors.CheckViolation)


def test_new_tracks_get_a_stats_row(db):
    track_id = db.value(
        "INSERT INTO track (album_id, title, duration_ms) VALUES (1, 'Fresh', 90000) "
        "RETURNING track_id"
    )
    assert db.value("SELECT play_count FROM track_stat WHERE track_id = %s", (track_id,)) == 0


def test_usernames_are_case_insensitive(db):
    err = db.fails("INSERT INTO app_user (username) VALUES ('JOHN_DOE')")
    assert isinstance(err, psycopg.errors.UniqueViolation)


def test_subscriptions_cannot_overlap(db):
    db.rows("DELETE FROM subscription WHERE user_id = 2")
    db.rows(
        "INSERT INTO subscription (user_id, plan_id, active_during) "
        "VALUES (2, 1, '[2026-01-01,2026-03-01)')"
    )
    err = db.fails(
        "INSERT INTO subscription (user_id, plan_id, active_during) "
        "VALUES (2, 3, '[2026-02-15,2026-04-01)')"
    )
    assert isinstance(err, psycopg.errors.ExclusionViolation)
    # Back-to-back periods are fine: daterange upper bounds are exclusive.
    db.rows(
        "INSERT INTO subscription (user_id, plan_id, active_during) VALUES (2, 3, '[2026-03-01,)')"
    )
