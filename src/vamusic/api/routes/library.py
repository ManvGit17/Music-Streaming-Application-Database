"""The signed-in listener's likes, follows, plays, recommendations and Wrapped."""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status

from vamusic.api import schemas
from vamusic.api.deps import CurrentUser, DbSession, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api/me", tags=["library"], route_class=LensRoute)

Limit = Annotated[int, Query(ge=1, le=200)]


def _pk(db: DbSession, query: str, public_id: UUID, what: str) -> Any:
    pk = db.qv(query, id=public_id)
    if pk is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")
    return pk


@router.get("/likes", response_model=list[schemas.Track])
def likes(db: DbSession, _user: CurrentUser, limit: Limit = 100) -> list[Row]:
    return db.q("library.likes", limit=limit)


@router.put("/likes/{track_id}", status_code=204)
def like(track_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.q("library.like", track_id=_pk(db, "library.track_pk", track_id, "track"))
    return Response(status_code=204)


@router.delete("/likes/{track_id}", status_code=204)
def unlike(track_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.q("library.unlike", track_id=_pk(db, "library.track_pk", track_id, "track"))
    return Response(status_code=204)


@router.get("/follows", response_model=list[schemas.ArtistRef])
def follows(db: DbSession, _user: CurrentUser) -> list[Row]:
    return db.q("library.follows")


@router.put("/follows/{artist_id}", status_code=204)
def follow(artist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.q("library.follow", artist_id=_pk(db, "library.artist_pk", artist_id, "artist"))
    return Response(status_code=204)


@router.delete("/follows/{artist_id}", status_code=204)
def unfollow(artist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.q("library.unfollow", artist_id=_pk(db, "library.artist_pk", artist_id, "artist"))
    return Response(status_code=204)


@router.post("/plays", status_code=201)
def record_play(body: schemas.PlayIn, db: DbSession, _user: CurrentUser) -> Row:
    """Record a listen. Counters update in the same statement via statement-level triggers."""
    row = db.q1(
        "library.record_play",
        track_id=_pk(db, "library.track_pk", body.track_id, "track"),
        ms_played=body.ms_played,
        completed=body.completed,
        device=body.device,
        quality=body.quality,
    )
    assert row is not None
    return {"played_at": row["played_at"]}


@router.get("/history", response_model=list[schemas.Play])
def history(db: DbSession, _user: CurrentUser, limit: Limit = 50) -> list[Row]:
    return db.q("library.history", limit=limit)


@router.get("/recommendations", response_model=list[schemas.ScoredTrack])
def recommendations(db: DbSession, _user: CurrentUser, limit: Limit = 20) -> list[Row]:
    return db.q("library.recommendations", limit=limit)


@router.get("/wrapped")
def wrapped(
    db: DbSession, _user: CurrentUser, year: Annotated[int, Query(ge=2000, le=2100)] = 2026
) -> Row:
    return dict(db.qv("library.wrapped", year=year))
