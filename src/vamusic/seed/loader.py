"""Bulk-load a generated ``Dataset`` with COPY."""

from __future__ import annotations

import time
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

import bcrypt
import psycopg
from psycopg import sql

from vamusic.seed.generator import Dataset, Row

#: Every seeded account uses this password, so the demo is usable out of the box.
DEMO_PASSWORD = "vamusic"  # noqa: S105 - documented demo credential, not a secret

# (table, columns, Dataset attribute). Order respects foreign keys.
_TABLES: list[tuple[str, tuple[str, ...], str]] = [
    ("genre", ("genre_id", "name", "description", "hue"), "genres"),
    ("artist", ("artist_id", "name", "bio", "country", "is_verified", "hue"), "artists"),
    (
        "album",
        (
            "album_id",
            "artist_id",
            "title",
            "album_type",
            "genre_id",
            "release_date",
            "label",
            "cover_seed",
        ),
        "albums",
    ),
    (
        "track",
        (
            "track_id",
            "album_id",
            "title",
            "disc_number",
            "track_number",
            "duration_ms",
            "is_explicit",
            "audio_seed",
            "features",
        ),
        "tracks",
    ),
    ("track_credit", ("track_id", "artist_id", "role"), "credits"),
    (
        "plan",
        (
            "plan_id",
            "name",
            "price",
            "period_days",
            "download_limit",
            "ad_free",
            "lossless",
            "offline",
            "max_devices",
            "description",
        ),
        "plans",
    ),
    ("app_user", ("user_id", "username", "display_name", "country", "created_at"), "users"),
    ("user_account", ("user_id", "email", "birth_date", "role", "password_hash"), "accounts"),
    (
        "subscription",
        ("subscription_id", "user_id", "plan_id", "active_during", "status"),
        "subscriptions",
    ),
    (
        "payment",
        ("subscription_id", "amount", "method", "reference", "status", "paid_at"),
        "payments",
    ),
    ("artist_follow", ("user_id", "artist_id"), "artist_follows"),
    ("user_follow", ("follower_id", "followee_id"), "user_follows"),
    ("track_like", ("user_id", "track_id", "liked_at"), "likes"),
    (
        "playlist",
        ("playlist_id", "owner_id", "name", "description", "is_public", "cover_seed", "created_at"),
        "playlists",
    ),
    ("playlist_track", ("playlist_id", "track_id", "position", "added_by"), "playlist_tracks"),
    ("playlist_follow", ("user_id", "playlist_id"), "playlist_follows"),
    (
        "listening_event",
        ("user_id", "track_id", "played_at", "ms_played", "completed", "device", "quality"),
        "events",
    ),
]

_IDENTITY = [
    ("genre", "genre_id"),
    ("artist", "artist_id"),
    ("album", "album_id"),
    ("track", "track_id"),
    ("plan", "plan_id"),
    ("app_user", "user_id"),
    ("subscription", "subscription_id"),
    ("playlist", "playlist_id"),
]

_AUDITED = ("genre", "artist", "album", "track", "plan", "user_account")


@dataclass
class LoadReport:
    rows: dict[str, int]
    seconds: dict[str, float]


class AlreadySeeded(RuntimeError):
    pass


def _copy(conn: psycopg.Connection, table: str, columns: Sequence[str], rows: Iterable[Row]) -> int:
    stmt = sql.SQL("COPY vamusic.{} ({}) FROM STDIN").format(
        sql.Identifier(table), sql.SQL(", ").join(map(sql.Identifier, columns))
    )
    n = 0
    with conn.cursor().copy(stmt) as copy:
        for row in rows:
            copy.write_row(row)
            n += 1
    return n


def load(conn: psycopg.Connection, ds: Dataset) -> LoadReport:
    """Load ``ds`` into an empty database in one transaction."""
    if conn.execute("SELECT EXISTS (SELECT 1 FROM vamusic.track)").fetchone() == (True,):
        raise AlreadySeeded("the catalog already has data; seed into a fresh database")

    password_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt(10)).decode()
    accounts = [(*row, password_hash) for row in ds.accounts]

    report = LoadReport(rows={}, seconds={})
    with conn.transaction():
        # Bulk history isn't an admin edit; keep it out of the audit log.
        for table in _AUDITED:
            conn.execute(
                sql.SQL("ALTER TABLE vamusic.{} DISABLE TRIGGER audit").format(
                    sql.Identifier(table)
                )
            )
        for table, columns, attr in _TABLES:
            rows = accounts if attr == "accounts" else getattr(ds, attr)
            t0 = time.perf_counter()
            report.rows[table] = _copy(conn, table, columns, rows)
            report.seconds[table] = round(time.perf_counter() - t0, 3)
        for table in _AUDITED:
            conn.execute(
                sql.SQL("ALTER TABLE vamusic.{} ENABLE TRIGGER audit").format(sql.Identifier(table))
            )
        # COPY wrote explicit ids; move each identity sequence past them.
        for table, column in _IDENTITY:
            conn.execute(
                sql.SQL(
                    "SELECT setval(pg_get_serial_sequence({qualified}, {col}), "
                    "coalesce((SELECT max({ident}) FROM vamusic.{tbl}), 0) + 1, false)"
                ).format(
                    qualified=sql.Literal(f"vamusic.{table}"),
                    col=sql.Literal(column),
                    ident=sql.Identifier(column),
                    tbl=sql.Identifier(table),
                )
            )

    t0 = time.perf_counter()
    conn.execute("SELECT * FROM vamusic.refresh_analytics()")
    conn.commit()
    report.seconds["refresh_analytics"] = round(time.perf_counter() - t0, 3)

    # ANALYZE can't run inside a transaction block alongside the load.
    conn.autocommit = True
    try:
        conn.execute("ANALYZE")
    finally:
        conn.autocommit = False
    return report
