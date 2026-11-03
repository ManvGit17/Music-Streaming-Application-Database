"""Deterministic synthetic data for VaMusic.

``generate(scale, seed)`` is a pure function: the same arguments always produce the same rows,
so benchmarks and screenshots are reproducible. No real artists, songs or people are used;
names are assembled from word lists.

What makes the data realistic enough to be interesting:
  * each genre has an audio-feature centroid; artists and tracks scatter around it, so vector
    similarity finds musically coherent neighbours;
  * listeners have a few favourite genres, an activity level, and a preferred time of day;
  * track popularity within a genre follows a Zipf curve, and a handful of tracks go viral
    in the final weeks, so "trending" differs from "all-time most played";
  * traffic grows over the 18-month window, and about a third of plays are skips.
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from vamusic.seed import classic

Scale = Literal["tiny", "web", "demo", "full"]
Row = tuple[Any, ...]

#: The last moment covered by generated listening history.
ANCHOR = datetime(2026, 10, 31, 23, 0, tzinfo=UTC)
HISTORY_DAYS = 548


@dataclass(frozen=True)
class ScaleSpec:
    artists: int
    users: int
    events: int


SCALES: dict[Scale, ScaleSpec] = {
    "tiny": ScaleSpec(artists=30, users=60, events=6_000),
    # Sized for the in-browser demo: loads into PGlite in a few seconds on first visit.
    "web": ScaleSpec(artists=100, users=250, events=20_000),
    "demo": ScaleSpec(artists=120, users=400, events=60_000),
    "full": ScaleSpec(artists=220, users=5_000, events=1_000_000),
}

# Feature order: energy, valence, danceability, acousticness, instrumentalness, speechiness,
# liveness, tempo.
FEATURES = (
    "energy",
    "valence",
    "danceability",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
    "tempo",
)

# name -> (description, hue, centroid)
GENRE_PROFILE: dict[str, tuple[str, int, tuple[float, ...]]] = {
    "Pop": ("", 330, (0.70, 0.70, 0.75, 0.20, 0.05, 0.08, 0.15, 0.60)),
    "Rock": ("", 8, (0.82, 0.50, 0.50, 0.12, 0.10, 0.06, 0.25, 0.65)),
    "Hip Hop": ("", 45, (0.68, 0.55, 0.80, 0.12, 0.03, 0.45, 0.18, 0.50)),
    "Electronic": ("", 190, (0.85, 0.55, 0.78, 0.05, 0.65, 0.05, 0.12, 0.72)),
    "Classical": ("", 40, (0.20, 0.35, 0.22, 0.95, 0.90, 0.04, 0.20, 0.35)),
    "Jazz": ("", 28, (0.40, 0.55, 0.50, 0.75, 0.55, 0.06, 0.35, 0.45)),
    "Country": ("", 22, (0.60, 0.65, 0.58, 0.45, 0.05, 0.05, 0.22, 0.55)),
    "R&B": ("", 290, (0.52, 0.55, 0.70, 0.30, 0.05, 0.12, 0.15, 0.45)),
    "Metal": ("", 0, (0.95, 0.25, 0.35, 0.03, 0.20, 0.08, 0.30, 0.80)),
    "Indie": ("", 160, (0.58, 0.48, 0.55, 0.40, 0.20, 0.05, 0.18, 0.55)),
    "Lo-fi": (
        "Mellow, dusty beats to study to",
        250,
        (0.25, 0.50, 0.62, 0.55, 0.80, 0.06, 0.10, 0.38),
    ),
    "Ambient": (
        "Texture and atmosphere over rhythm",
        210,
        (0.12, 0.40, 0.15, 0.70, 0.95, 0.03, 0.08, 0.25),
    ),
    "Folk": ("Acoustic storytelling", 95, (0.35, 0.55, 0.45, 0.85, 0.10, 0.06, 0.25, 0.48)),
    "Soul": ("Warm vocals, live horns", 18, (0.55, 0.65, 0.62, 0.40, 0.04, 0.07, 0.30, 0.50)),
    "Latin": ("Rhythm-forward dance music", 12, (0.78, 0.80, 0.85, 0.25, 0.04, 0.10, 0.20, 0.62)),
    "Blues": ("Twelve bars and a feeling", 225, (0.45, 0.35, 0.45, 0.60, 0.15, 0.06, 0.40, 0.45)),
}

PLANS = [
    # name, price, period days, downloads, ad free, lossless, offline, devices, description
    ("Free", "0.00", 0, 0, False, False, False, 1, "Basic free plan with ads"),
    ("Basic", "4.99", 30, 10, True, False, True, 1, "Ad-free music with limited downloads"),
    ("Premium", "9.99", 30, 100, True, True, True, 3, "High quality streaming with downloads"),
    ("Family", "14.99", 30, 500, True, True, True, 6, "Share with up to 6 family members"),
    ("Student", "2.99", 30, 50, True, True, True, 1, "Discounted plan for students"),
]

_ADJ = [
    "Velvet",
    "Golden",
    "Hollow",
    "Electric",
    "Silent",
    "Paper",
    "Crimson",
    "Neon",
    "Lunar",
    "Wild",
    "Quiet",
    "Amber",
    "Glass",
    "Midnight",
    "Static",
    "Silver",
    "Distant",
    "Coral",
    "Iron",
    "Indigo",
    "Faded",
    "Northern",
    "Gentle",
    "Burning",
    "Solar",
    "Restless",
    "Copper",
    "Pale",
    "Scarlet",
    "Hidden",
    "Endless",
    "Violet",
    "Frozen",
    "Tender",
    "Broken",
    "Dusty",
    "Bright",
]
_NOUN = [
    "Harbor",
    "Echo",
    "Season",
    "River",
    "Garden",
    "Signal",
    "Lantern",
    "Orchard",
    "Mirror",
    "Satellite",
    "Tide",
    "Canyon",
    "Avenue",
    "Comet",
    "Meadow",
    "Engine",
    "Parade",
    "Horizon",
    "Atlas",
    "Ember",
    "Cathedral",
    "Arcade",
    "Compass",
    "Prairie",
    "Monsoon",
    "Kite",
    "Lighthouse",
    "Pilot",
    "Window",
    "Valley",
    "Thunder",
    "Ribbon",
    "Glacier",
    "Station",
    "Fever",
    "Bloom",
]
_FIRST = [
    "Ava",
    "Leo",
    "Mira",
    "Kai",
    "Noor",
    "Iris",
    "Theo",
    "Zara",
    "Arlo",
    "Juno",
    "Remy",
    "Esme",
    "Ravi",
    "Lena",
    "Otto",
    "Nia",
    "Sol",
    "Vera",
    "Ines",
    "Milo",
    "Tara",
    "Hugo",
    "Lila",
    "Omar",
    "Ada",
    "Ezra",
    "Maya",
    "Felix",
    "Rhea",
    "Ilan",
    "Suki",
    "Dario",
    "Freya",
    "Kian",
]
_LAST = [
    "Vale",
    "Okafor",
    "Lindqvist",
    "Moreau",
    "Tanaka",
    "Rivera",
    "Novak",
    "Haddad",
    "Kerr",
    "Mendes",
    "Sato",
    "Ibarra",
    "Quinn",
    "Varga",
    "Holt",
    "Achebe",
    "Rossi",
    "Kaur",
    "Nakamura",
    "Silva",
    "Dubois",
    "Fischer",
    "Laine",
    "Osei",
    "Petrov",
    "Weiss",
]
_COUNTRIES = [
    "US",
    "GB",
    "DE",
    "FR",
    "IN",
    "JP",
    "BR",
    "CA",
    "AU",
    "SE",
    "NG",
    "MX",
    "KR",
    "ES",
    "IT",
    "NL",
]
_LABELS = [
    "Northlight Records",
    "Paper Moon",
    "Static Bloom",
    "Harbor House",
    "Golden Hour",
    "Ironwood",
]
_DEVICES = (
    ("mobile", 0.55),
    ("desktop", 0.15),
    ("web", 0.12),
    ("speaker", 0.08),
    ("car", 0.06),
    ("tablet", 0.04),
)
_QUALITY = (("normal", 0.45), ("high", 0.35), ("low", 0.12), ("lossless", 0.08))


@dataclass
class Dataset:
    """Rows for each table, in column order matching ``vamusic.seed.loader``."""

    genres: list[Row] = field(default_factory=list)
    artists: list[Row] = field(default_factory=list)
    albums: list[Row] = field(default_factory=list)
    tracks: list[Row] = field(default_factory=list)
    credits: list[Row] = field(default_factory=list)
    plans: list[Row] = field(default_factory=list)
    users: list[Row] = field(default_factory=list)
    accounts: list[Row] = field(default_factory=list)
    subscriptions: list[Row] = field(default_factory=list)
    payments: list[Row] = field(default_factory=list)
    artist_follows: list[Row] = field(default_factory=list)
    user_follows: list[Row] = field(default_factory=list)
    likes: list[Row] = field(default_factory=list)
    playlists: list[Row] = field(default_factory=list)
    playlist_tracks: list[Row] = field(default_factory=list)
    playlist_follows: list[Row] = field(default_factory=list)
    events: list[Row] = field(default_factory=list)


@dataclass
class _Track:
    track_id: int
    genre: int
    artist_id: int
    duration_ms: int
    features: tuple[float, ...]


@dataclass
class _Listener:
    user_id: int
    joined: datetime
    genre_weights: list[float]
    activity: float
    peak_hour: int


def _clamp(x: float) -> float:
    return min(1.0, max(0.0, x))


def _jitter(rng: random.Random, base: tuple[float, ...], spread: float) -> tuple[float, ...]:
    return tuple(round(_clamp(v + rng.gauss(0, spread)), 4) for v in base)


def _vector(values: tuple[float, ...]) -> str:
    return "[" + ",".join(f"{v:.4f}" for v in values) + "]"


def _pick_weighted(rng: random.Random, options: tuple[tuple[str, float], ...]) -> str:
    return rng.choices([o for o, _ in options], [w for _, w in options])[0]


def _unique(used: set[str], make: Callable[[], str]) -> str:
    for _ in range(1000):
        candidate = str(make())
        if candidate not in used:
            used.add(candidate)
            return candidate
    raise RuntimeError("ran out of unique names")


def generate(scale: Scale = "demo", seed: int = 17) -> Dataset:
    spec = SCALES[scale]
    rng = random.Random(seed)
    ds = Dataset()

    # Genres: the ten from v1 first (same ids), then the new ones.
    genre_names = [g for g, _ in classic.GENRES] + [
        g for g in GENRE_PROFILE if g not in dict(classic.GENRES)
    ]
    classic_desc = dict(classic.GENRES)
    for gid, name in enumerate(genre_names, 1):
        desc, hue, _ = GENRE_PROFILE[name]
        ds.genres.append((gid, name, classic_desc.get(name, desc), hue))
    centroids = {gid: GENRE_PROFILE[name][2] for gid, name in enumerate(genre_names, 1)}

    # Artists and albums: v1's first, then generated.
    used_names = {a[0] for a in classic.ARTISTS}
    artist_genre: dict[int, int] = {}
    artist_center: dict[int, tuple[float, ...]] = {}
    for aid, (name, bio, country, verified) in enumerate(classic.ARTISTS, 1):
        genre = classic.ALBUMS[aid - 1][4]
        ds.artists.append(
            (aid, name, bio, country, verified, GENRE_PROFILE[genre_names[genre - 1]][1])
        )
        artist_genre[aid] = genre
        artist_center[aid] = _jitter(rng, centroids[genre], 0.06)

    def artist_name() -> str:
        style = rng.random()
        if style < 0.35:
            return f"The {rng.choice(_ADJ)} {rng.choice(_NOUN)}s"
        if style < 0.7:
            return f"{rng.choice(_FIRST)} {rng.choice(_LAST)}"
        return f"{rng.choice(_ADJ)} {rng.choice(_NOUN)}"

    for aid in range(len(classic.ARTISTS) + 1, spec.artists + 1):
        genre = rng.randint(1, len(genre_names))
        name = _unique(used_names, artist_name)
        country = rng.choice(_COUNTRIES)
        bio = f"{genre_names[genre - 1]} from {country}."
        hue = (GENRE_PROFILE[genre_names[genre - 1]][1] + rng.randint(-25, 25)) % 360
        ds.artists.append((aid, name, bio, country, rng.random() < 0.6, hue))
        artist_genre[aid] = genre
        artist_center[aid] = _jitter(rng, centroids[genre], 0.06)

    tracks: list[_Track] = []
    used_titles: set[str] = set()

    def title() -> str:
        style = rng.random()
        if style < 0.4:
            return f"{rng.choice(_ADJ)} {rng.choice(_NOUN)}"
        if style < 0.7:
            return f"{rng.choice(_NOUN)} of {rng.choice(_NOUN)}s"
        return rng.choice(_NOUN) if rng.random() < 0.5 else f"{rng.choice(_ADJ)} {rng.choice(_ADJ)}"

    album_id = 0
    track_id = 0
    # v1 albums and tracks.
    for title_, artist_no, released, kind, genre, label in classic.ALBUMS:
        album_id += 1
        ds.albums.append(
            (
                album_id,
                artist_no,
                title_,
                kind,
                genre,
                date.fromisoformat(released),
                label,
                rng.randrange(1 << 30),
            )
        )
    for t_title, album_no, seconds, number, explicit in classic.TRACKS:
        track_id += 1
        artist_no = classic.ALBUMS[album_no - 1][1]
        feats = _jitter(rng, artist_center[artist_no], 0.08)
        ds.tracks.append(
            (
                track_id,
                album_no,
                t_title,
                1,
                number,
                seconds * 1000,
                explicit,
                rng.randrange(1 << 30),
                _vector(feats),
            )
        )
        ds.credits.append((track_id, artist_no, "primary"))
        tracks.append(
            _Track(track_id, classic.ALBUMS[album_no - 1][4], artist_no, seconds * 1000, feats)
        )

    # Generated discographies: 1-4 releases per artist.
    for aid in range(len(classic.ARTISTS) + 1, spec.artists + 1):
        for _ in range(rng.randint(1, 4)):
            album_id += 1
            kind = rng.choices(["album", "ep", "single"], [0.5, 0.3, 0.2])[0]
            count = {"album": rng.randint(8, 14), "ep": rng.randint(4, 6), "single": 1}[kind]
            release_day = (ANCHOR - timedelta(days=rng.randint(20, 3000))).date()
            album_title = _unique(used_titles, title)
            ds.albums.append(
                (
                    album_id,
                    aid,
                    album_title,
                    kind,
                    artist_genre[aid],
                    release_day,
                    rng.choice(_LABELS),
                    rng.randrange(1 << 30),
                )
            )
            for number in range(1, count + 1):
                track_id += 1
                t_title = album_title if kind == "single" else _unique(used_titles, title)
                seconds = int(_clamp(rng.gauss(0.5, 0.15)) * 300 + 90)
                feats = _jitter(rng, artist_center[aid], 0.08)
                ds.tracks.append(
                    (
                        track_id,
                        album_id,
                        t_title,
                        1,
                        number,
                        seconds * 1000,
                        rng.random() < 0.12,
                        rng.randrange(1 << 30),
                        _vector(feats),
                    )
                )
                ds.credits.append((track_id, aid, "primary"))
                if rng.random() < 0.08:
                    guest = rng.randint(1, spec.artists)
                    if guest != aid:
                        ds.credits.append((track_id, guest, "featured"))
                tracks.append(_Track(track_id, artist_genre[aid], aid, seconds * 1000, feats))

    for pid, plan in enumerate(PLANS, 1):
        ds.plans.append((pid, *plan))

    # Listeners: v1 accounts first, an admin, then generated people.
    listeners: list[_Listener] = []
    used_usernames: set[str] = set()
    start = ANCHOR - timedelta(days=HISTORY_DAYS)

    def add_user(
        username: str,
        email: str,
        display: str,
        country: str,
        birth: date,
        role: str,
        joined: datetime,
    ) -> int:
        uid = len(ds.users) + 1
        used_usernames.add(username.lower())
        ds.users.append((uid, username, display, country, joined))
        ds.accounts.append((uid, email, birth, role))
        weights = [rng.random() ** 3 for _ in genre_names]
        listeners.append(
            _Listener(
                uid, joined, weights, rng.lognormvariate(0, 0.9), rng.choice([8, 13, 18, 21, 23])
            )
        )
        return uid

    for username, email, first, last, country, birth in classic.USERS:
        add_user(
            username,
            email,
            f"{first} {last}",
            country,
            date.fromisoformat(birth),
            "listener",
            start + timedelta(days=rng.randint(0, 30)),
        )
    add_user("admin", "admin@vamusic.dev", "Admin", "IN", date(2000, 1, 1), "admin", start)

    def make_username() -> str:
        first, last = rng.choice(_FIRST).lower(), rng.choice(_LAST).lower()
        return f"{first}{rng.choice(['_', '.', ''])}{last}{rng.randint(1, 99)}"

    while len(ds.users) < spec.users:
        name = _unique(used_usernames, make_username)
        first = name.split("_")[0].split(".")[0].rstrip("0123456789").capitalize()
        joined = start + timedelta(days=HISTORY_DAYS * rng.random() ** 1.6)
        add_user(
            name,
            f"{name}@example.com",
            first,
            rng.choice(_COUNTRIES),
            date(rng.randint(1965, 2008), rng.randint(1, 12), rng.randint(1, 28)),
            "listener",
            joined,
        )

    # Subscriptions: one plan from signup, sometimes an upgrade later (non-overlapping ranges).
    sub_id = 0
    for listener in listeners:
        first_plan = rng.choices([1, 2, 3, 4, 5], [0.45, 0.12, 0.25, 0.08, 0.10])[0]
        joined_day = listener.joined.date()
        if rng.random() < 0.25 and first_plan != 3:
            switch = joined_day + timedelta(days=rng.randint(30, 300))
            if switch < ANCHOR.date():
                sub_id += 1
                ds.subscriptions.append(
                    (sub_id, listener.user_id, first_plan, f"[{joined_day},{switch})", "expired")
                )
                sub_id += 1
                ds.subscriptions.append((sub_id, listener.user_id, 3, f"[{switch},)", "active"))
                continue
        sub_id += 1
        ds.subscriptions.append(
            (sub_id, listener.user_id, first_plan, f"[{joined_day},)", "active")
        )
    plan_price = {pid: p[1] for pid, p in enumerate(PLANS, 1)}
    for sid, _uid, plan_id, period, _status in ds.subscriptions:
        if plan_price[plan_id] != "0.00":
            started = period[1:11]
            ds.payments.append(
                (
                    sid,
                    plan_price[plan_id],
                    rng.choice(["card", "upi", "paypal", "netbanking"]),
                    f"TXN-{seed}-{sid:07d}",
                    "completed",
                    started,
                )
            )

    # Popularity: Zipf within each genre, with a few late-breaking hits.
    by_genre: dict[int, list[_Track]] = {}
    for t in tracks:
        by_genre.setdefault(t.genre, []).append(t)
    genre_weights: dict[int, list[float]] = {}
    for g, items in by_genre.items():
        rng.shuffle(items)
        genre_weights[g] = [1 / (rank**0.95) for rank in range(1, len(items) + 1)]
    viral = set(rng.sample([t.track_id for t in tracks], k=max(3, len(tracks) // 150)))
    genre_ids = sorted(by_genre)

    # Listening events: total volume grows ~3x across the window.
    total_activity = sum(lst.activity for lst in listeners)
    for listener in listeners:
        n = round(spec.events * listener.activity / total_activity)
        weights = [listener.genre_weights[g - 1] for g in genre_ids]
        span = (ANCHOR - listener.joined).total_seconds()
        for _ in range(n):
            # Inverse-CDF of a linearly increasing density: later dates are more likely.
            u = rng.random()
            offset = span * (math.sqrt(1 + 8 * u) - 1) / 2 if span > 0 else 0.0
            when = listener.joined + timedelta(seconds=offset)
            hour = int(rng.gauss(listener.peak_hour, 3)) % 24
            when = when.replace(hour=hour, minute=rng.randint(0, 59), second=rng.randint(0, 59))
            if when > ANCHOR:
                when = ANCHOR - timedelta(minutes=rng.randint(1, 600))
            late = (ANCHOR - when).days < 21
            if late and viral and rng.random() < 0.06:
                track = tracks[rng.choice(sorted(viral)) - 1]
            else:
                g = rng.choices(genre_ids, weights)[0]
                track = rng.choices(by_genre[g], genre_weights[g])[0]
            completed = rng.random() < 0.68
            played = track.duration_ms if completed else int(track.duration_ms * rng.random() * 0.8)
            ds.events.append(
                (
                    listener.user_id,
                    track.track_id,
                    when,
                    played,
                    completed,
                    _pick_weighted(rng, _DEVICES),
                    _pick_weighted(rng, _QUALITY),
                )
            )
    ds.events.sort(key=lambda e: e[2])

    # Likes and follows follow listening: people like what they play to the end.
    liked: set[tuple[int, int]] = set()
    for uid, tid, when, _ms, completed, _d, _q in ds.events:
        if completed and rng.random() < 0.035 and (uid, tid) not in liked:
            liked.add((uid, tid))
            ds.likes.append((uid, tid, when))
    followed: set[tuple[int, int]] = set()
    for uid, tid in sorted(liked):
        if rng.random() < 0.3:
            aid = tracks[tid - 1].artist_id
            if (uid, aid) not in followed:
                followed.add((uid, aid))
                ds.artist_follows.append((uid, aid))
    user_ids = [lst.user_id for lst in listeners]
    for uid in user_ids:
        for other in rng.sample(user_ids, k=min(len(user_ids), rng.randint(0, 6))):
            if other != uid:
                ds.user_follows.append((uid, other))

    # Playlists built from each owner's own taste.
    playlist_id = 0
    names = [
        "Late Night Drive",
        "Focus",
        "Sunday Morning",
        "Gym",
        "Rainy Day",
        "Throwbacks",
        "Deep Cuts",
        "Road Trip",
        "Dinner Party",
        "Wind Down",
        "Discoveries",
        "On Repeat",
    ]
    for listener in listeners:
        for _ in range(rng.choices([0, 1, 2, 3], [0.4, 0.35, 0.18, 0.07])[0]):
            playlist_id += 1
            ds.playlists.append(
                (
                    playlist_id,
                    listener.user_id,
                    rng.choice(names),
                    None,
                    rng.random() < 0.8,
                    rng.randrange(1 << 30),
                    min(ANCHOR, listener.joined + timedelta(days=rng.randint(0, 60))),
                )
            )
            g = rng.choices(genre_ids, [listener.genre_weights[i - 1] for i in genre_ids])[0]
            picks = rng.sample(by_genre[g], k=min(len(by_genre[g]), rng.randint(6, 30)))
            for pos, t in enumerate(picks, 1):
                ds.playlist_tracks.append((playlist_id, t.track_id, pos, listener.user_id))
    public_playlists = [p for p in ds.playlists if p[4]]
    for uid in user_ids:
        for p in rng.sample(public_playlists, k=min(len(public_playlists), rng.randint(0, 3))):
            if p[1] != uid:
                ds.playlist_follows.append((uid, p[0]))

    return ds
