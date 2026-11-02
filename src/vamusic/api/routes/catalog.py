"""Browse, search and discover. Open to everyone."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from vamusic.api import queries, schemas
from vamusic.api.deps import DbSession
from vamusic.api.queries import TRACK_FIELDS, TRACK_JOINS, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api", tags=["catalog"], route_class=LensRoute)

Limit = Annotated[int, Query(ge=1, le=100)]


@router.get("/genres", response_model=list[schemas.Genre])
def genres(db: DbSession) -> list[Row]:
    return db.all("""
        SELECT g.genre_id AS id, g.name, g.description, g.hue, count(t.track_id) AS tracks
        FROM vamusic.genre g
        LEFT JOIN vamusic.album al USING (genre_id)
        LEFT JOIN vamusic.track t ON t.album_id = al.album_id
        GROUP BY g.genre_id
        ORDER BY tracks DESC, g.name
    """)


@router.get("/search", response_model=list[schemas.SearchHit])
def search(
    db: DbSession, q: Annotated[str, Query(min_length=1, max_length=200)], limit: Limit = 20
) -> list[Row]:
    rows = db.all(
        f"""
        SELECT {TRACK_FIELDS}, s.score, s.lexical_rank, s.fuzzy_rank
        FROM vamusic.search_tracks(%s, %s) s
        JOIN vamusic.track t USING (track_id)
        {TRACK_JOINS}
        ORDER BY s.score DESC, t.track_id
        """,
        (q, limit),
    )
    return [queries.track(r) for r in rows]


@router.get("/trending", response_model=list[schemas.ScoredTrack])
def trending(
    db: DbSession, limit: Limit = 20, genre: Annotated[int | None, Query()] = None
) -> list[Row]:
    rows = db.all(
        f"""
        SELECT {TRACK_FIELDS}, tt.score::float8 AS score, 'trending' AS reason
        FROM vamusic.trending_track tt
        JOIN vamusic.track t USING (track_id)
        {TRACK_JOINS}
        WHERE %(genre)s::int IS NULL OR al.genre_id = %(genre)s
        ORDER BY tt.rank
        LIMIT %(limit)s
        """,
        {"genre": genre, "limit": limit},
    )
    return [queries.track(r) for r in rows]


@router.get("/tracks/{track_id}", response_model=schemas.Track)
def get_track(track_id: UUID, db: DbSession) -> Row:
    row = db.one(
        f"SELECT {TRACK_FIELDS} FROM vamusic.track t {TRACK_JOINS} WHERE t.public_id = %s",
        (track_id,),
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "track not found")
    return queries.track(row)


@router.get("/tracks/{track_id}/similar", response_model=list[schemas.ScoredTrack])
def similar(track_id: UUID, db: DbSession, limit: Limit = 12) -> list[Row]:
    rows = db.all(
        f"""
        SELECT {TRACK_FIELDS}, s.similarity AS score, 'sounds like' AS reason
        FROM vamusic.track src
        CROSS JOIN LATERAL vamusic.similar_tracks(src.track_id, %s) s
        JOIN vamusic.track t ON t.track_id = s.track_id
        {TRACK_JOINS}
        WHERE src.public_id = %s
        ORDER BY s.similarity DESC
        """,
        (limit, track_id),
    )
    return [queries.track(r) for r in rows]


@router.get("/artists", response_model=list[schemas.Artist])
def top_artists(db: DbSession, limit: Limit = 20) -> list[Row]:
    return db.all(
        """
        SELECT d.public_id AS id, d.name, ar.bio, ar.country, d.is_verified AS verified,
               ar.hue, d.monthly_listeners, d.followers, d.total_plays,
               EXISTS (SELECT 1 FROM vamusic.artist_follow f
                       WHERE f.user_id = vamusic.current_user_id()
                         AND f.artist_id = d.artist_id) AS following
        FROM vamusic.artist_dashboard d
        JOIN vamusic.artist ar USING (artist_id)
        ORDER BY d.monthly_listeners DESC, d.total_plays DESC
        LIMIT %s
        """,
        (limit,),
    )


@router.get("/artists/{artist_id}", response_model=schemas.Artist)
def get_artist(artist_id: UUID, db: DbSession) -> Row:
    artist = db.one(
        """
        SELECT d.artist_id, d.public_id AS id, d.name, ar.bio, ar.country,
               d.is_verified AS verified, ar.hue, d.monthly_listeners, d.followers,
               d.total_plays,
               EXISTS (SELECT 1 FROM vamusic.artist_follow f
                       WHERE f.user_id = vamusic.current_user_id()
                         AND f.artist_id = d.artist_id) AS following
        FROM vamusic.artist_dashboard d
        JOIN vamusic.artist ar USING (artist_id)
        WHERE d.public_id = %s
        """,
        (artist_id,),
    )
    if artist is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "artist not found")
    artist["top_tracks"] = queries.tracks(
        db.all(
            f"SELECT {TRACK_FIELDS} FROM vamusic.track t {TRACK_JOINS} "
            "WHERE al.artist_id = %s ORDER BY ts.play_count DESC, t.track_id LIMIT 10",
            (artist["artist_id"],),
        )
    )
    artist["albums"] = [
        {**a, "artist": {"id": artist["id"], "name": artist["name"], "hue": artist["hue"]}}
        for a in db.all(
            """
            SELECT al.public_id AS id, al.title, al.album_type, al.release_date, al.label,
                   al.cover_seed, g.name AS genre
            FROM vamusic.album al LEFT JOIN vamusic.genre g USING (genre_id)
            WHERE al.artist_id = %s
            ORDER BY al.release_date DESC NULLS LAST
            """,
            (artist["artist_id"],),
        )
    ]
    return artist


@router.get("/albums/{album_id}", response_model=schemas.Album)
def get_album(album_id: UUID, db: DbSession) -> Row:
    album = db.one(
        """
        SELECT al.album_id, al.public_id AS id, al.title, al.album_type, al.release_date,
               al.label, al.cover_seed, g.name AS genre,
               ar.public_id AS artist_id, ar.name AS artist_name, ar.hue AS artist_hue
        FROM vamusic.album al
        JOIN vamusic.artist ar USING (artist_id)
        LEFT JOIN vamusic.genre g USING (genre_id)
        WHERE al.public_id = %s
        """,
        (album_id,),
    )
    if album is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "album not found")
    album["artist"] = {
        "id": album["artist_id"],
        "name": album["artist_name"],
        "hue": album["artist_hue"],
    }
    album["tracks"] = queries.tracks(
        db.all(
            f"SELECT {TRACK_FIELDS} FROM vamusic.track t {TRACK_JOINS} "
            "WHERE t.album_id = %s ORDER BY t.disc_number, t.track_number",
            (album["album_id"],),
        )
    )
    return album
