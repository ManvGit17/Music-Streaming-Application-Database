"""Playlists. Visibility and ownership are enforced by row-level security."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status

from vamusic.api import queries, schemas
from vamusic.api.deps import CurrentUser, DbSession
from vamusic.api.queries import TRACK_FIELDS, TRACK_JOINS, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api", tags=["playlists"], route_class=LensRoute)

_SUMMARY = """
    SELECT p.playlist_id, p.public_id AS id, p.name, p.description, p.is_public, p.cover_seed,
           p.updated_at, p.owner_id IS NOT DISTINCT FROM vamusic.current_user_id() AS is_owner,
           u.public_id AS owner_id, u.username AS owner_username,
           u.display_name AS owner_display_name,
           (SELECT count(*) FROM vamusic.playlist_track pt
            WHERE pt.playlist_id = p.playlist_id) AS track_count,
           vamusic.playlist_duration_ms(p.playlist_id) AS duration_ms,
           vamusic.playlist_follower_count(p.playlist_id) AS followers
    FROM vamusic.playlist p
    JOIN vamusic.app_user u ON u.user_id = p.owner_id
"""


def _shape(row: Row) -> Row:
    row["owner"] = {
        "id": row.pop("owner_id"),
        "username": row.pop("owner_username"),
        "display_name": row.pop("owner_display_name"),
    }
    return row


def _load(db: DbSession, playlist_id: UUID) -> Row:
    row = db.one(_SUMMARY + " WHERE p.public_id = %s", (playlist_id,))
    if row is None:
        # Private playlists of other listeners are invisible, so this is also their answer.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "playlist not found")
    return row


@router.get("/me/playlists", response_model=list[schemas.PlaylistSummary])
def my_playlists(db: DbSession, _user: CurrentUser) -> list[Row]:
    rows = db.all(
        _SUMMARY + " WHERE p.owner_id = vamusic.current_user_id() ORDER BY p.updated_at DESC"
    )
    return [_shape(r) for r in rows]


@router.get("/playlists", response_model=list[schemas.PlaylistSummary])
def public_playlists(db: DbSession, limit: int = 20) -> list[Row]:
    rows = db.all(
        _SUMMARY + " WHERE p.is_public ORDER BY followers DESC, p.playlist_id LIMIT %s",
        (min(max(limit, 1), 100),),
    )
    return [_shape(r) for r in rows]


@router.get("/playlists/{playlist_id}", response_model=schemas.Playlist)
def get_playlist(playlist_id: UUID, db: DbSession) -> Row:
    row = _load(db, playlist_id)
    row["tracks"] = queries.tracks(
        db.all(
            f"SELECT {TRACK_FIELDS} FROM vamusic.playlist_track pt "
            f"JOIN vamusic.track t ON t.track_id = pt.track_id {TRACK_JOINS} "
            "WHERE pt.playlist_id = %s ORDER BY pt.position",
            (row["playlist_id"],),
        )
    )
    return _shape(row)


@router.post("/playlists", response_model=schemas.Playlist, status_code=201)
def create_playlist(body: schemas.PlaylistIn, db: DbSession, _user: CurrentUser) -> Row:
    public_id = db.value(
        "INSERT INTO vamusic.playlist (owner_id, name, description, is_public, cover_seed) "
        "VALUES (vamusic.current_user_id(), %s, %s, %s, (random() * 1e9)::int) "
        "RETURNING public_id",
        (body.name, body.description, body.is_public),
    )
    return get_playlist(public_id, db)


@router.patch("/playlists/{playlist_id}", response_model=schemas.Playlist)
def update_playlist(
    playlist_id: UUID, body: schemas.PlaylistPatch, db: DbSession, _user: CurrentUser
) -> Row:
    changes = body.model_dump(exclude_unset=True)
    updated = db.value(
        """
        UPDATE vamusic.playlist SET
            name = coalesce(%(name)s, name),
            description = CASE WHEN %(has_desc)s THEN %(description)s ELSE description END,
            is_public = coalesce(%(is_public)s, is_public)
        WHERE public_id = %(id)s
        RETURNING public_id
        """,
        {
            "id": playlist_id,
            "name": changes.get("name"),
            "has_desc": "description" in changes,
            "description": changes.get("description"),
            "is_public": changes.get("is_public"),
        },
    )
    if updated is None:
        _forbid_or_missing(db, playlist_id)
    return get_playlist(playlist_id, db)


@router.delete("/playlists/{playlist_id}", status_code=204)
def delete_playlist(playlist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    deleted = db.value(
        "DELETE FROM vamusic.playlist WHERE public_id = %s RETURNING playlist_id", (playlist_id,)
    )
    if deleted is None:
        _forbid_or_missing(db, playlist_id)
    return Response(status_code=204)


def _forbid_or_missing(db: DbSession, playlist_id: UUID) -> None:
    """RLS filtered the write out: distinguish 'not yours' from 'doesn't exist'."""
    _load(db, playlist_id)
    raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can change this playlist")


def _owned_pk(db: DbSession, playlist_id: UUID) -> int:
    row = _load(db, playlist_id)
    if not row["is_owner"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can change this playlist")
    return int(row["playlist_id"])


@router.post("/playlists/{playlist_id}/tracks", response_model=schemas.Playlist)
def add_track(
    playlist_id: UUID, body: schemas.PlaylistTrackIn, db: DbSession, _user: CurrentUser
) -> Row:
    pk = _owned_pk(db, playlist_id)
    track = db.value("SELECT track_id FROM vamusic.track WHERE public_id = %s", (body.track_id,))
    if track is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "track not found")
    db.all("SELECT vamusic.playlist_add_track(%s, %s)", (pk, track))
    return get_playlist(playlist_id, db)


@router.delete("/playlists/{playlist_id}/tracks/{track_id}", response_model=schemas.Playlist)
def remove_track(playlist_id: UUID, track_id: UUID, db: DbSession, _user: CurrentUser) -> Row:
    pk = _owned_pk(db, playlist_id)
    db.all(
        "SELECT vamusic.playlist_remove_track(%s, t.track_id) FROM vamusic.track t "
        "WHERE t.public_id = %s",
        (pk, track_id),
    )
    return get_playlist(playlist_id, db)


@router.put("/playlists/{playlist_id}/order", response_model=schemas.Playlist)
def reorder(
    playlist_id: UUID, body: schemas.PlaylistOrderIn, db: DbSession, _user: CurrentUser
) -> Row:
    pk = _owned_pk(db, playlist_id)
    db.all(
        """
        SELECT vamusic.playlist_reorder(%s, array(
            SELECT t.track_id
            FROM unnest(%s::uuid[]) WITH ORDINALITY AS o(public_id, ord)
            LEFT JOIN vamusic.track t ON t.public_id = o.public_id
            ORDER BY o.ord))
        """,
        (pk, body.track_ids),
    )
    return get_playlist(playlist_id, db)


@router.put("/playlists/{playlist_id}/follow", status_code=204)
def follow_playlist(playlist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    pk = _load(db, playlist_id)["playlist_id"]
    db.all(
        "INSERT INTO vamusic.playlist_follow (user_id, playlist_id) "
        "VALUES (vamusic.current_user_id(), %s) ON CONFLICT DO NOTHING",
        (pk,),
    )
    return Response(status_code=204)


@router.delete("/playlists/{playlist_id}/follow", status_code=204)
def unfollow_playlist(playlist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    pk = _load(db, playlist_id)["playlist_id"]
    db.all("DELETE FROM vamusic.playlist_follow WHERE playlist_id = %s", (pk,))
    return Response(status_code=204)
