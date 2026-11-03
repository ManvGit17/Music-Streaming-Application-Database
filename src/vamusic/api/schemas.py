"""Request and response models."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Model(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth -------------------------------------------------------------------------------------


class RegisterIn(Model):
    username: str = Field(pattern=r"^[A-Za-z0-9_.]{3,32}$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=64)


class LoginIn(Model):
    login: str = Field(min_length=1, max_length=254, description="Username or email")
    password: str = Field(min_length=1, max_length=128)


class UserRef(Model):
    id: UUID
    username: str
    display_name: str | None = None


class Session(Model):
    token: str
    user: UserRef
    role: Literal["listener", "admin"]


class Me(Model):
    id: UUID
    username: str
    display_name: str | None
    country: str | None
    email: str
    role: Literal["listener", "admin"]
    joined: datetime
    tier: str
    plays: int
    minutes: int
    plan: str | None


class ProfileIn(Model):
    display_name: str | None = Field(default=None, max_length=64)
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")


# --- catalog ----------------------------------------------------------------------------------


class ArtistRef(Model):
    id: UUID
    name: str
    hue: int


class AlbumRef(Model):
    id: UUID
    title: str
    cover_seed: int


class Track(Model):
    id: UUID
    title: str
    duration_ms: int
    explicit: bool
    audio_seed: int
    track_number: int | None
    artist: ArtistRef
    album: AlbumRef
    genre: str | None
    genre_hue: int | None
    plays: int
    likes: int
    liked: bool
    #: Eight audio features in [0, 1]; the web app generates each track's music from them.
    features: list[float] | None = None


class ScoredTrack(Track):
    score: float
    reason: str | None = None


class SearchHit(Track):
    score: float
    lexical_rank: int | None
    fuzzy_rank: int | None


class Genre(Model):
    id: int
    name: str
    description: str | None
    hue: int
    tracks: int


class Album(Model):
    id: UUID
    title: str
    album_type: str
    release_date: date | None
    label: str | None
    cover_seed: int
    genre: str | None
    artist: ArtistRef
    tracks: list[Track] = []


class Artist(Model):
    id: UUID
    name: str
    bio: str | None
    country: str | None
    verified: bool
    hue: int
    monthly_listeners: int
    followers: int
    total_plays: int
    following: bool
    albums: list[Album] = []
    top_tracks: list[Track] = []


# --- listening --------------------------------------------------------------------------------


class PlayIn(Model):
    track_id: UUID
    ms_played: int = Field(ge=0, le=3_600_000)
    completed: bool = False
    device: Literal["web", "desktop", "mobile", "tablet", "speaker", "car"] = "web"
    quality: Literal["low", "normal", "high", "lossless"] = "normal"


class Play(Model):
    track: Track
    played_at: datetime
    ms_played: int
    completed: bool
    device: str


# --- playlists --------------------------------------------------------------------------------


class PlaylistIn(Model):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_public: bool = True


class PlaylistPatch(Model):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_public: bool | None = None


class PlaylistTrackIn(Model):
    track_id: UUID


class PlaylistOrderIn(Model):
    track_ids: list[UUID] = Field(min_length=1, max_length=5000)


class PlaylistSummary(Model):
    id: UUID
    name: str
    description: str | None
    is_public: bool
    cover_seed: int
    owner: UserRef
    track_count: int
    duration_ms: int
    followers: int
    updated_at: datetime


class Playlist(PlaylistSummary):
    tracks: list[Track]
    is_owner: bool


# --- admin ------------------------------------------------------------------------------------


class Overview(Model):
    counts: dict[str, int]
    revenue_this_month: float
    plays_last_30_days: list[dict[str, Any]]
    top_tracks: list[Track]
    partitions: list[dict[str, Any]]


class AuditEntry(Model):
    id: int
    at: datetime
    actor: str | None
    db_role: str
    table: str
    operation: str
    row_key: dict[str, Any]
    before: dict[str, Any] | None
    after: dict[str, Any] | None


class ArtistPatch(Model):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    bio: str | None = Field(default=None, max_length=2000)
    verified: bool | None = None
