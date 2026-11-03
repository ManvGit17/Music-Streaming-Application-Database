"""Playlists. Visibility and ownership are enforced by row-level security."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status

from vamusic.api import schemas
from vamusic.api.deps import CurrentUser, DbSession, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api", tags=["playlists"], route_class=LensRoute)


def _load(db: DbSession, playlist_id: UUID) -> Row:
    row = db.q1("playlists.by_id", id=playlist_id)
    if row is None:
        # Private playlists of other listeners are invisible, so this is also their answer.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "playlist not found")
    return row


def _owned(db: DbSession, playlist_id: UUID) -> int:
    row = _load(db, playlist_id)
    if not row["is_owner"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can change this playlist")
    return int(row["playlist_id"])


@router.get("/me/playlists", response_model=list[schemas.PlaylistSummary])
def my_playlists(db: DbSession, _user: CurrentUser) -> list[Row]:
    return db.q("playlists.mine")


@router.get("/playlists", response_model=list[schemas.PlaylistSummary])
def public_playlists(db: DbSession, limit: Annotated[int, Query(ge=1, le=100)] = 20) -> list[Row]:
    return db.q("playlists.public", limit=limit)


@router.get("/playlists/{playlist_id}", response_model=schemas.Playlist)
def get_playlist(playlist_id: UUID, db: DbSession) -> Row:
    row = _load(db, playlist_id)
    row["tracks"] = db.q("playlists.tracks", playlist_id=row["playlist_id"])
    return row


@router.post("/playlists", response_model=schemas.Playlist, status_code=201)
def create_playlist(body: schemas.PlaylistIn, db: DbSession, _user: CurrentUser) -> Row:
    public_id = db.qv(
        "playlists.create",
        name=body.name,
        description=body.description,
        is_public=body.is_public,
    )
    return get_playlist(public_id, db)


@router.patch("/playlists/{playlist_id}", response_model=schemas.Playlist)
def update_playlist(
    playlist_id: UUID, body: schemas.PlaylistPatch, db: DbSession, _user: CurrentUser
) -> Row:
    _owned(db, playlist_id)
    changes = body.model_dump(exclude_unset=True)
    db.q(
        "playlists.update",
        id=playlist_id,
        name=changes.get("name"),
        has_description="description" in changes,
        description=changes.get("description"),
        is_public=changes.get("is_public"),
    )
    return get_playlist(playlist_id, db)


@router.delete("/playlists/{playlist_id}", status_code=204)
def delete_playlist(playlist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    _owned(db, playlist_id)
    db.q("playlists.delete", id=playlist_id)
    return Response(status_code=204)


@router.post("/playlists/{playlist_id}/tracks", response_model=schemas.Playlist)
def add_track(
    playlist_id: UUID, body: schemas.PlaylistTrackIn, db: DbSession, _user: CurrentUser
) -> Row:
    pk = _owned(db, playlist_id)
    track = db.qv("library.track_pk", id=body.track_id)
    if track is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "track not found")
    db.q("playlists.add_track", playlist_id=pk, track_id=track)
    return get_playlist(playlist_id, db)


@router.delete("/playlists/{playlist_id}/tracks/{track_id}", response_model=schemas.Playlist)
def remove_track(playlist_id: UUID, track_id: UUID, db: DbSession, _user: CurrentUser) -> Row:
    db.q("playlists.remove_track", playlist_id=_owned(db, playlist_id), track_id=track_id)
    return get_playlist(playlist_id, db)


@router.put("/playlists/{playlist_id}/order", response_model=schemas.Playlist)
def reorder(
    playlist_id: UUID, body: schemas.PlaylistOrderIn, db: DbSession, _user: CurrentUser
) -> Row:
    db.q("playlists.reorder", playlist_id=_owned(db, playlist_id), track_ids=body.track_ids)
    return get_playlist(playlist_id, db)


@router.put("/playlists/{playlist_id}/follow", status_code=204)
def follow_playlist(playlist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.q("playlists.follow", playlist_id=_load(db, playlist_id)["playlist_id"])
    return Response(status_code=204)


@router.delete("/playlists/{playlist_id}/follow", status_code=204)
def unfollow_playlist(playlist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.q("playlists.unfollow", playlist_id=_load(db, playlist_id)["playlist_id"])
    return Response(status_code=204)
