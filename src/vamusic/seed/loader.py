"""Bulk-load a generated ``Dataset`` with COPY."""

from __future__ import annotations

import gzip
import json
import time
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

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


def _text_value(value: object) -> str:
    """One field in PostgreSQL's COPY text format."""
    if value is None:
        return r"\N"
    if isinstance(value, bool):
        return "t" if value else "f"
    if isinstance(value, datetime | date):
        return value.isoformat()
    text = str(value)
    return text.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def export(ds: Dataset, out_dir: Path) -> dict[str, object]:
    """Write ``ds`` as gzipped COPY text files plus a manifest, for loading into PGlite.

    The web demo replays these with ``COPY ... FROM '/dev/blob'`` in the same table order the
    loader uses, so the browser holds exactly the dataset the Docker setup does.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    # A fixed salt keeps the export reproducible; the demo password is public anyway.
    password_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), b"$2b$10$vamusicdemosaltvamusie").decode()
    accounts = [(*row, password_hash) for row in ds.accounts]
    tables = []
    for table, columns, attr in _TABLES:
        rows = accounts if attr == "accounts" else getattr(ds, attr)
        path = out_dir / f"{table}.tsv.gz"
        text = "".join("\t".join(_text_value(v) for v in row) + "\n" for row in rows)
        # mtime=0 makes the archive byte-for-byte reproducible.
        path.write_bytes(gzip.compress(text.encode("utf-8"), mtime=0))
        tables.append(
            {"table": table, "columns": list(columns), "file": path.name, "rows": len(rows)}
        )
    manifest: dict[str, object] = {
        "tables": tables,
        "identity": [{"table": t, "column": c} for t, c in _IDENTITY],
        "audited": list(_AUDITED),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def load(conn: psycopg.Connection, ds: Dataset, *, summarize: bool = True) -> LoadReport:
    """Load ``ds`` into an empty database in one transaction.

    ``summarize=False`` leaves the BRIN index on play time unsummarized, as it is straight after
    a bulk load; only the BRIN benchmark wants that.
    """
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
    if summarize:
        # The BRIN index predates the load, so the loaded block ranges have no summaries yet.
        conn.execute("SELECT vamusic.summarize_listening_events()")
    conn.commit()
    report.seconds["refresh_analytics"] = round(time.perf_counter() - t0, 3)

    # ANALYZE can't run inside a transaction block alongside the load.
    conn.autocommit = True
    try:
        conn.execute("ANALYZE")
    finally:
        conn.autocommit = False
    return report
