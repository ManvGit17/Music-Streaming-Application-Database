"""Admin workspace: platform overview, audit log, rollup refresh and catalog edits."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from vamusic.api import schemas
from vamusic.api.deps import AdminUser, DbSession, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api/admin", tags=["admin"], route_class=LensRoute)


@router.get("/overview", response_model=schemas.Overview)
def overview(db: DbSession, _admin: AdminUser) -> Row:
    """Catalog counts, this month's revenue, daily plays, top tracks and listening partitions."""
    counts = db.q1("admin.counts")
    assert counts is not None
    return {
        "counts": counts,
        "revenue_this_month": float(db.qv("admin.revenue") or 0),
        "plays_last_30_days": db.q("admin.daily_plays"),
        "top_tracks": db.q("admin.top_tracks"),
        "partitions": db.q("admin.partitions"),
    }


@router.get("/audit", response_model=list[schemas.AuditEntry])
def audit(
    db: DbSession,
    _admin: AdminUser,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    table: str | None = None,
) -> list[Row]:
    """Recent audit-log entries, optionally for one table. Secrets are redacted."""
    return db.q("admin.audit", table=table, limit=limit)


@router.post("/refresh")
def refresh(db: DbSession, _admin: AdminUser) -> list[Row]:
    """Refresh every materialized view concurrently; returns how long each took."""
    return db.q("admin.refresh")


@router.patch("/artists/{artist_id}", response_model=schemas.ArtistRef)
def update_artist(
    artist_id: UUID, body: schemas.ArtistPatch, db: DbSession, _admin: AdminUser
) -> Row:
    """Edit an artist. The change is written to the audit log by a trigger."""
    changes = body.model_dump(exclude_unset=True)
    row = db.q1(
        "admin.update_artist",
        id=artist_id,
        name=changes.get("name"),
        has_bio="bio" in changes,
        bio=changes.get("bio"),
        verified=changes.get("verified"),
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "artist not found")
    return row
