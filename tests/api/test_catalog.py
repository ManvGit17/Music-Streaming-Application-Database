"""Browse, search, discovery and the schema endpoint."""

from __future__ import annotations

import uuid


def test_search_survives_typos(client):
    hits = client.get("/api/search", params={"q": "midnite tran"}).json()
    assert hits[0]["title"] == "Midnight Train"
    assert hits[0]["artist"]["name"] == "The Melodics"
    assert hits[0]["fuzzy_rank"] == 1


def test_search_requires_a_query(client):
    assert client.get("/api/search").status_code == 422


def test_trending(client):
    rows = client.get("/api/trending", params={"limit": 5}).json()
    assert len(rows) == 5
    scores = [r["score"] for r in rows]
    assert scores == sorted(scores, reverse=True)


def test_trending_by_genre(client):
    genres = client.get("/api/genres").json()
    rock = next(g for g in genres if g["name"] == "Rock")
    rows = client.get("/api/trending", params={"genre": rock["id"]}).json()
    assert rows and {r["genre"] for r in rows} == {"Rock"}


def test_track_and_similar(client):
    hit = client.get("/api/search", params={"q": "Morning Light"}).json()[0]
    track = client.get(f"/api/tracks/{hit['id']}").json()
    assert track["title"] == "Morning Light"
    assert track["liked"] is False  # signed out: RLS returns no likes
    similar = client.get(f"/api/tracks/{hit['id']}/similar", params={"limit": 5}).json()
    assert len(similar) == 5 and hit["id"] not in [s["id"] for s in similar]


def test_unknown_track(client):
    assert client.get(f"/api/tracks/{uuid.uuid4()}").status_code == 404


def test_artist_and_album_pages(client):
    artists = client.get("/api/artists", params={"limit": 3}).json()
    assert len(artists) == 3
    artist = client.get(f"/api/artists/{artists[0]['id']}").json()
    assert artist["albums"] and artist["top_tracks"]
    album = client.get(f"/api/albums/{artist['albums'][0]['id']}").json()
    assert album["artist"]["id"] == artist["id"]
    numbers = [t["track_number"] for t in album["tracks"]]
    assert numbers == sorted(numbers)


def test_schema_introspection(client):
    body = client.get("/api/schema").json()
    tables = {t["name"]: t for t in body["tables"]}
    assert tables["listening_event"]["kind"] == "partitioned"
    assert tables["trending_track"]["kind"] == "materialized view"
    assert tables["playlist"]["rls"] is True
    columns = {c["name"]: c for c in tables["track"]["columns"]}
    assert columns["duration_seconds"]["generated"] == "virtual"
    assert any(fk["to_table"] == "album" for fk in body["foreign_keys"])
