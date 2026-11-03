"""The data generator is pure and deterministic, so these need no database."""

from __future__ import annotations

from vamusic.seed import classic
from vamusic.seed.generator import ANCHOR, HISTORY_DAYS, SCALES, generate


def test_same_seed_same_data():
    a, b = generate("tiny", seed=5), generate("tiny", seed=5)
    assert a.tracks == b.tracks and a.events == b.events


def test_different_seed_different_data():
    assert generate("tiny", seed=1).events != generate("tiny", seed=2).events


def test_v1_catalog_and_accounts_are_kept():
    ds = generate("tiny")
    assert [a[1] for a in ds.artists[: len(classic.ARTISTS)]] == [a[0] for a in classic.ARTISTS]
    assert [t[2] for t in ds.tracks[: len(classic.TRACKS)]] == [t[0] for t in classic.TRACKS]
    assert ds.users[0][1] == "john_doe"


def test_scale_is_respected():
    spec = SCALES["tiny"]
    ds = generate("tiny")
    assert len(ds.artists) == spec.artists
    assert len(ds.users) == spec.users
    assert abs(len(ds.events) - spec.events) / spec.events < 0.02


def test_events_fall_inside_the_history_window():
    ds = generate("tiny")
    times = [e[2] for e in ds.events]
    assert max(times) <= ANCHOR
    assert (ANCHOR - min(times)).days <= HISTORY_DAYS + 1
    assert times == sorted(times)


def test_features_are_unit_interval_vectors():
    for row in generate("tiny").tracks:
        values = [float(v) for v in row[-1].strip("[]").split(",")]
        assert len(values) == 8 and all(0 <= v <= 1 for v in values)


def test_no_duplicate_relationships():
    ds = generate("tiny")
    assert len({(u, t) for u, t, _ in ds.likes}) == len(ds.likes)
    assert len(set(ds.user_follows)) == len(ds.user_follows)
    assert len({(p, t) for p, t, *_ in ds.playlist_tracks}) == len(ds.playlist_tracks)


def test_artist_bio_matches_country():
    for _aid, _name, bio, country, *_ in generate("tiny").artists[10:]:
        assert bio.endswith(f"from {country}.")
