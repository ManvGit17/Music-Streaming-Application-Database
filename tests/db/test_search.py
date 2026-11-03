"""Hybrid search and vector recommendations."""

from __future__ import annotations

import pytest


def titles(db, query, limit=3):
    return [
        r["title"]
        for r in db.rows(
            "SELECT t.title FROM search_tracks(%s, %s) s JOIN track t USING (track_id) "
            "ORDER BY s.score DESC",
            (query, limit),
        )
    ]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("Midnight Train", "Midnight Train"),
        ("midnite tran", "Midnight Train"),  # typos
        ("mid tra", "Midnight Train"),  # prefixes, as you type
        ("MORNING light", "Morning Light"),  # case
    ],
)
def test_search_finds_the_track(db, query, expected):
    assert titles(db, query)[0] == expected


def test_search_matches_artist_names(db):
    rows = db.rows(
        "SELECT ar.name FROM search_tracks('luna rose', 5) s JOIN track t USING (track_id) "
        "JOIN album al USING (album_id) JOIN artist ar ON ar.artist_id = al.artist_id"
    )
    assert rows and all(r["name"] == "Luna Rose" for r in rows)


def test_search_ignores_accents(db):
    db.rows(
        "INSERT INTO track (album_id, title, track_number, duration_ms) "
        "VALUES (1, 'Café Señorita', 99, 180000)"
    )
    db.rows("REFRESH MATERIALIZED VIEW catalog_search")
    assert titles(db, "cafe senorita")[0] == "Café Señorita"


def test_search_with_no_words(db):
    assert titles(db, "!!!") == []


def test_similar_tracks_are_sorted_and_exclude_the_seed(db):
    rows = db.rows("SELECT * FROM similar_tracks(1, 10)")
    assert len(rows) == 10
    assert 1 not in [r["track_id"] for r in rows]
    sims = [r["similarity"] for r in rows]
    assert sims == sorted(sims, reverse=True)


def test_similar_tracks_use_the_hnsw_index(db):
    db.rows("SET LOCAL enable_seqscan = off")
    plan = "\n".join(
        r["QUERY PLAN"]
        for r in db.rows(
            "EXPLAIN SELECT track_id FROM track "
            "ORDER BY features <=> (SELECT features FROM track WHERE track_id = 1) LIMIT 5"
        )
    )
    assert "track_features_hnsw" in plan


def test_recommendations_skip_liked_and_recent_tracks(db):
    recs = {r["track_id"] for r in db.rows("SELECT * FROM recommend_tracks(1, 20)")}
    assert recs
    liked = {r["track_id"] for r in db.rows("SELECT track_id FROM track_like WHERE user_id = 1")}
    recent = {
        r["track_id"]
        for r in db.rows("""
        SELECT track_id FROM listening_event WHERE user_id = 1
        AND played_at > (SELECT max(played_at) FROM listening_event WHERE user_id = 1)
                        - interval '30 days'""")
    }
    assert not recs & (liked | recent)


def test_new_listeners_get_trending_tracks(db):
    uid = db.value("INSERT INTO app_user (username) VALUES ('newcomer') RETURNING user_id")
    rows = db.rows("SELECT * FROM recommend_tracks(%s, 5)", (uid,))
    assert {r["reason"] for r in rows} == {"trending"}
