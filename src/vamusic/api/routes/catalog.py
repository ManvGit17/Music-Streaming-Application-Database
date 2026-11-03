"""Browse, search and discover. Open to everyone."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from vamusic.api import schemas
from vamusic.api.deps import DbSession, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api", tags=["catalog"], route_class=LensRoute)

Limit = Annotated[int, Query(ge=1, le=100)]


@router.get("/genres", response_model=list[schemas.Genre])
def genres(db: DbSession) -> list[Row]:
    return db.q("catalog.genres")


@router.get("/search", response_model=list[schemas.SearchHit])
def search(
    db: DbSession, q: Annotated[str, Query(min_length=1, max_length=200)], limit: Limit = 20
) -> list[Row]:
    return db.q("catalog.search", q=q, limit=limit)


@router.get("/trending", response_model=list[schemas.ScoredTrack])
def trending(
    db: DbSession, limit: Limit = 20, genre: Annotated[int | None, Query()] = None
) -> list[Row]:
    return db.q("catalog.trending", genre=genre, limit=limit)


@router.get("/tracks/{track_id}", response_model=schemas.Track)
def get_track(track_id: UUID, db: DbSession) -> Row:
    row = db.q1("catalog.track", id=track_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "track not found")
    return row


@router.get("/tracks/{track_id}/similar", response_model=list[schemas.ScoredTrack])
def similar(track_id: UUID, db: DbSession, limit: Limit = 12) -> list[Row]:
    return db.q("catalog.similar", id=track_id, limit=limit)


@router.get("/artists", response_model=list[schemas.Artist])
def top_artists(db: DbSession, limit: Limit = 20) -> list[Row]:
    return db.q("catalog.top_artists", limit=limit)


@router.get("/artists/{artist_id}", response_model=schemas.Artist)
def get_artist(artist_id: UUID, db: DbSession) -> Row:
    artist = db.q1("catalog.artist", id=artist_id)
    if artist is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "artist not found")
    artist["top_tracks"] = db.q("catalog.artist_top_tracks", artist_id=artist["artist_id"])
    artist["albums"] = db.q("catalog.artist_albums", artist_id=artist["artist_id"])
    return artist


@router.get("/albums/{album_id}", response_model=schemas.Album)
def get_album(album_id: UUID, db: DbSession) -> Row:
    album = db.q1("catalog.album", id=album_id)
    if album is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "album not found")
    album["tracks"] = db.q("catalog.album_tracks", album_id=album["album_id"])
    return album
