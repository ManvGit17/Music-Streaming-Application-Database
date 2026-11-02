"""Likes, follows, plays, recommendations and Wrapped."""

from __future__ import annotations


def first_track(client, q="Northern Lights"):
    return client.get("/api/search", params={"q": q}).json()[0]


def test_like_round_trip(client, newbie):
    track = first_track(client)
    assert client.put(f"/api/me/likes/{track['id']}", headers=newbie).status_code == 204
    assert (
        client.put(f"/api/me/likes/{track['id']}", headers=newbie).status_code == 204
    )  # idempotent
    detail = client.get(f"/api/tracks/{track['id']}", headers=newbie).json()
    assert detail["liked"] is True
    assert detail["likes"] == track["likes"] + 1
    assert [t["id"] for t in client.get("/api/me/likes", headers=newbie).json()] == [track["id"]]
    assert client.delete(f"/api/me/likes/{track['id']}", headers=newbie).status_code == 204
    assert client.get("/api/me/likes", headers=newbie).json() == []


def test_likes_are_private(client, newbie, john):
    track = first_track(client, "City Dreams")
    client.put(f"/api/me/likes/{track['id']}", headers=newbie)
    johns = {t["id"] for t in client.get("/api/me/likes", headers=john).json()}
    assert (
        track["id"] not in johns
        or client.get(f"/api/tracks/{track['id']}", headers=john).json()["liked"]
    )


def test_follow_artist(client, newbie):
    artist = client.get("/api/artists", params={"limit": 1}).json()[0]
    assert client.put(f"/api/me/follows/{artist['id']}", headers=newbie).status_code == 204
    page = client.get(f"/api/artists/{artist['id']}", headers=newbie).json()
    assert page["following"] is True
    assert page["followers"] == artist["followers"] + 1
    assert client.delete(f"/api/me/follows/{artist['id']}", headers=newbie).status_code == 204


def test_recording_a_play(client, newbie):
    track = first_track(client, "Desert Sun")
    res = client.post(
        "/api/me/plays",
        headers=newbie,
        json={"track_id": track["id"], "ms_played": 215000, "completed": True},
    )
    assert res.status_code == 201
    after = client.get(f"/api/tracks/{track['id']}").json()
    assert after["plays"] == track["plays"] + 1
    history = client.get("/api/me/history", headers=newbie).json()
    assert history[0]["track"]["id"] == track["id"]
    assert client.get("/api/me", headers=newbie).json()["plays"] == 1


def test_plays_require_sign_in(client):
    track = first_track(client)
    res = client.post("/api/me/plays", json={"track_id": track["id"], "ms_played": 1})
    assert res.status_code == 401


def test_recommendations(client, john, newbie):
    mine = client.get("/api/me/recommendations", headers=john).json()
    assert mine and {r["reason"] for r in mine} == {"taste"}
    fresh = client.get("/api/me/recommendations", headers=newbie).json()
    assert fresh and {r["reason"] for r in fresh} == {"trending"}


def test_wrapped(client, john):
    wrapped = client.get("/api/me/wrapped", headers=john, params={"year": 2026}).json()
    assert wrapped["year"] == 2026
    assert wrapped["plays"] > 0
    assert wrapped["top_tracks"]
