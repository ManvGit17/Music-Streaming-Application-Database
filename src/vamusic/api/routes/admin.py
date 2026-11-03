"""Admin workspace: platform overview, audit log, rollup refresh and catalog edits."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from vamusic.api import queries, schemas
from vamusic.api.deps import AdminUser, DbSession
from vamusic.api.queries import TRACK_FIELDS, TRACK_JOINS, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api/admin", tags=["admin"], route_class=LensRoute)


@router.get("/overview", response_model=schemas.Overview)
def overview(db: DbSession, _admin: AdminUser) -> Row:
    counts = db.one("""
        SELECT (SELECT count(*) FROM vamusic.app_user) AS listeners,
               (SELECT count(*) FROM vamusic.artist) AS artists,
               (SELECT count(*) FROM vamusic.album) AS albums,
               (SELECT count(*) FROM vamusic.track) AS tracks,
               (SELECT count(*) FROM vamusic.playlist) AS playlists,
               (SELECT sum(play_count) FROM vamusic.track_stat)::bigint AS plays
    """)
    assert counts is not None
    anchor = "(SELECT max(day) FROM vamusic.daily_track_play)"
    daily = db.all(f"""
        SELECT day, sum(plays)::bigint AS plays, sum(listeners)::bigint AS listener_days
        FROM vamusic.daily_track_play
        WHERE day > {anchor} - 30
        GROUP BY day ORDER BY day
    """)
    top = queries.tracks(
        db.all(
            f"SELECT {TRACK_FIELDS} FROM vamusic.track t {TRACK_JOINS} "
            "ORDER BY ts.play_count DESC, t.track_id LIMIT 5"
        )
    )
    partitions = db.all("""
        SELECT c.relname AS name,
               pg_get_expr(c.relpartbound, c.oid) AS bounds,
               c.reltuples::bigint AS estimated_rows,
               pg_total_relation_size(c.oid) AS bytes
        FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'vamusic.listening_event'::regclass AND c.reltuples > 0
        ORDER BY c.relname
    """)
    revenue = db.value("SELECT vamusic.monthly_revenue(current_date)")
    return {
        "counts": counts,
        "revenue_this_month": float(revenue or 0),
        "plays_last_30_days": daily,
        "top_tracks": top,
        "partitions": partitions,
    }


@router.get("/audit", response_model=list[schemas.AuditEntry])
def audit(
    db: DbSession,
    _admin: AdminUser,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    table: str | None = None,
) -> list[Row]:
    return db.all(
        """
        SELECT c.change_id AS id, c.changed_at AS at, u.username AS actor, c.db_role,
               c.table_name AS table, c.operation, c.row_key, c.before, c.after
        FROM audit.change_log c
        LEFT JOIN vamusic.app_user u ON u.user_id = c.actor_id
        WHERE %(table)s::text IS NULL OR c.table_name = %(table)s
        ORDER BY c.change_id DESC
        LIMIT %(limit)s
        """,
        {"table": table, "limit": limit},
    )


@router.post("/refresh")
def refresh(db: DbSession, _admin: AdminUser) -> list[Row]:
    """Refresh every materialized view concurrently; returns how long each took."""
    return db.all("SELECT view_name, duration_ms::float8 FROM vamusic.refresh_analytics()")


@router.patch("/artists/{artist_id}", response_model=schemas.ArtistRef)
def update_artist(
    artist_id: UUID, body: schemas.ArtistPatch, db: DbSession, _admin: AdminUser
) -> Row:
    changes = body.model_dump(exclude_unset=True)
    row = db.one(
        """
        UPDATE vamusic.artist SET
            name = coalesce(%(name)s, name),
            bio = CASE WHEN %(has_bio)s THEN %(bio)s ELSE bio END,
            is_verified = coalesce(%(verified)s, is_verified)
        WHERE public_id = %(id)s
        RETURNING public_id AS id, name, hue
        """,
        {
            "id": artist_id,
            "name": changes.get("name"),
            "has_bio": "bio" in changes,
            "bio": changes.get("bio"),
            "verified": changes.get("verified"),
        },
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "artist not found")
    return row
