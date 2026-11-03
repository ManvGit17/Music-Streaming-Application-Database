"""The signed-in listener's likes, follows, plays, recommendations and Wrapped."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status

from vamusic.api import queries, schemas
from vamusic.api.deps import CurrentUser, DbSession
from vamusic.api.queries import TRACK_FIELDS, TRACK_JOINS, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api/me", tags=["library"], route_class=LensRoute)

Limit = Annotated[int, Query(ge=1, le=200)]


def _track_pk(db: DbSession, track_id: UUID) -> int:
    pk = db.value("SELECT track_id FROM vamusic.track WHERE public_id = %s", (track_id,))
    if pk is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "track not found")
    return int(pk)


@router.get("/likes", response_model=list[schemas.Track])
def likes(db: DbSession, _user: CurrentUser, limit: Limit = 100) -> list[Row]:
    # No user filter needed: row-level security only returns the caller's likes.
    rows = db.all(
        f"""
        SELECT {TRACK_FIELDS}
        FROM vamusic.track_like lk
        JOIN vamusic.track t ON t.track_id = lk.track_id
        {TRACK_JOINS}
        ORDER BY lk.liked_at DESC
        LIMIT %s
        """,
        (limit,),
    )
    return [queries.track(r) for r in rows]


@router.put("/likes/{track_id}", status_code=204)
def like(track_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.all(
        "INSERT INTO vamusic.track_like (user_id, track_id) "
        "VALUES (vamusic.current_user_id(), %s) ON CONFLICT DO NOTHING",
        (_track_pk(db, track_id),),
    )
    return Response(status_code=204)


@router.delete("/likes/{track_id}", status_code=204)
def unlike(track_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.all("DELETE FROM vamusic.track_like WHERE track_id = %s", (_track_pk(db, track_id),))
    return Response(status_code=204)


@router.get("/follows", response_model=list[schemas.ArtistRef])
def follows(db: DbSession, _user: CurrentUser) -> list[Row]:
    return db.all("""
        SELECT ar.public_id AS id, ar.name, ar.hue
        FROM vamusic.artist_follow f JOIN vamusic.artist ar USING (artist_id)
        ORDER BY f.followed_at DESC
    """)


def _artist_pk(db: DbSession, artist_id: UUID) -> int:
    pk = db.value("SELECT artist_id FROM vamusic.artist WHERE public_id = %s", (artist_id,))
    if pk is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "artist not found")
    return int(pk)


@router.put("/follows/{artist_id}", status_code=204)
def follow(artist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.all(
        "INSERT INTO vamusic.artist_follow (user_id, artist_id) "
        "VALUES (vamusic.current_user_id(), %s) ON CONFLICT DO NOTHING",
        (_artist_pk(db, artist_id),),
    )
    return Response(status_code=204)


@router.delete("/follows/{artist_id}", status_code=204)
def unfollow(artist_id: UUID, db: DbSession, _user: CurrentUser) -> Response:
    db.all("DELETE FROM vamusic.artist_follow WHERE artist_id = %s", (_artist_pk(db, artist_id),))
    return Response(status_code=204)


@router.post("/plays", status_code=201)
def record_play(body: schemas.PlayIn, db: DbSession, _user: CurrentUser) -> Row:
    """Record a listen. Counters update in the same transaction via statement-level triggers."""
    row = db.one(
        """
        INSERT INTO vamusic.listening_event
            (user_id, track_id, ms_played, completed, device, quality)
        VALUES (vamusic.current_user_id(), %s, %s, %s, %s, %s)
        RETURNING played_at
        """,
        (_track_pk(db, body.track_id), body.ms_played, body.completed, body.device, body.quality),
    )
    assert row is not None
    return {"played_at": row["played_at"]}


@router.get("/history", response_model=list[schemas.Play])
def history(db: DbSession, _user: CurrentUser, limit: Limit = 50) -> list[Row]:
    rows = db.all(
        f"""
        SELECT {TRACK_FIELDS}, e.played_at, e.ms_played, e.completed, e.device
        FROM vamusic.listening_event e
        JOIN vamusic.track t ON t.track_id = e.track_id
        {TRACK_JOINS}
        WHERE e.user_id = vamusic.current_user_id()
        ORDER BY e.played_at DESC
        LIMIT %s
        """,
        (limit,),
    )
    play_keys = ("played_at", "ms_played", "completed", "device")
    return [
        {
            "track": queries.track({k: v for k, v in r.items() if k not in play_keys}),
            **{k: r[k] for k in play_keys},
        }
        for r in rows
    ]


@router.get("/recommendations", response_model=list[schemas.ScoredTrack])
def recommendations(db: DbSession, _user: CurrentUser, limit: Limit = 20) -> list[Row]:
    rows = db.all(
        f"""
        SELECT {TRACK_FIELDS}, r.score, r.reason
        FROM vamusic.recommend_tracks(vamusic.current_user_id(), %s) r
        JOIN vamusic.track t ON t.track_id = r.track_id
        {TRACK_JOINS}
        ORDER BY r.score DESC
        """,
        (limit,),
    )
    return [queries.track(r) for r in rows]


@router.get("/wrapped")
def wrapped(
    db: DbSession, _user: CurrentUser, year: Annotated[int, Query(ge=2000, le=2100)] = 2026
) -> Row:
    return dict(db.value("SELECT vamusic.my_wrapped(%s)", (year,)))
