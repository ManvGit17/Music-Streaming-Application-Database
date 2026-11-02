"""SQL shared across routes, and helpers to shape rows into response models."""

from __future__ import annotations

from typing import Any

from vamusic.api import schemas

#: A database row or a JSON object on its way to becoming a response model.
Row = dict[str, Any]

#: Everything a track card needs. ``liked`` is answered by row-level security: a listener only
#: sees their own likes, and a signed-out visitor sees none.
TRACK_FIELDS = """
    t.public_id AS id, t.title, t.duration_ms, t.is_explicit AS explicit, t.audio_seed,
    t.track_number,
    ar.public_id AS artist_id, ar.name AS artist_name, ar.hue AS artist_hue,
    al.public_id AS album_id, al.title AS album_title, al.cover_seed,
    g.name AS genre, g.hue AS genre_hue,
    ts.play_count AS plays, ts.like_count AS likes,
    EXISTS (SELECT 1 FROM vamusic.track_like l
            WHERE l.user_id = vamusic.current_user_id() AND l.track_id = t.track_id) AS liked
"""

TRACK_JOINS = """
    JOIN vamusic.album al ON al.album_id = t.album_id
    JOIN vamusic.artist ar ON ar.artist_id = al.artist_id
    LEFT JOIN vamusic.genre g ON g.genre_id = al.genre_id
    JOIN vamusic.track_stat ts ON ts.track_id = t.track_id
"""


def track(row: Row) -> Row:
    """Nest the flat columns from TRACK_FIELDS into the ``Track`` shape."""
    out = {k: v for k, v in row.items() if not k.startswith(("artist_", "album_"))}
    out["artist"] = {"id": row["artist_id"], "name": row["artist_name"], "hue": row["artist_hue"]}
    out["album"] = {
        "id": row["album_id"],
        "title": row["album_title"],
        "cover_seed": row["cover_seed"],
    }
    return out


def tracks(rows: list[Row]) -> list[schemas.Track]:
    return [schemas.Track.model_validate(track(r)) for r in rows]
