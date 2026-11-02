"""Playlist lifecycle and ownership rules."""

from __future__ import annotations

import pytest


@pytest.fixture
def tracks(client):
    return [
        client.get("/api/search", params={"q": q}).json()[0]["id"]
        for q in ("Morning Light", "City Dreams", "Midnight Train")
    ]


@pytest.fixture
def playlist(client, newbie, tracks):
    res = client.post("/api/playlists", headers=newbie, json={"name": "Road Trip"})
    assert res.status_code == 201
    pid = res.json()["id"]
    for t in tracks:
        client.post(f"/api/playlists/{pid}/tracks", headers=newbie, json={"track_id": t})
    return pid


def ids(body):
    return [t["id"] for t in body["tracks"]]


def test_build_a_playlist(client, newbie, playlist, tracks):
    body = client.get(f"/api/playlists/{playlist}", headers=newbie).json()
    assert ids(body) == tracks
    assert body["is_owner"] is True
    assert body["track_count"] == 3 and body["duration_ms"] > 0


def test_adding_twice_keeps_one_copy(client, newbie, playlist, tracks):
    body = client.post(
        f"/api/playlists/{playlist}/tracks", headers=newbie, json={"track_id": tracks[0]}
    ).json()
    assert ids(body) == tracks


def test_reorder_and_remove(client, newbie, playlist, tracks):
    body = client.put(
        f"/api/playlists/{playlist}/order", headers=newbie, json={"track_ids": tracks[::-1]}
    ).json()
    assert ids(body) == tracks[::-1]
    body = client.delete(f"/api/playlists/{playlist}/tracks/{tracks[1]}", headers=newbie).json()
    assert ids(body) == [tracks[2], tracks[0]]


def test_reorder_must_list_every_track(client, newbie, playlist, tracks):
    res = client.put(
        f"/api/playlists/{playlist}/order", headers=newbie, json={"track_ids": tracks[:2]}
    )
    assert res.status_code == 422


def test_others_can_read_but_not_change(client, newbie, john, playlist, tracks):
    assert client.get(f"/api/playlists/{playlist}", headers=john).json()["is_owner"] is False
    assert (
        client.patch(
            f"/api/playlists/{playlist}", headers=john, json={"name": "mine now"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/playlists/{playlist}/tracks", headers=john, json={"track_id": tracks[0]}
        ).status_code
        == 403
    )
    assert client.delete(f"/api/playlists/{playlist}", headers=john).status_code == 403


def test_private_playlists_are_invisible(client, newbie, john, playlist):
    client.patch(f"/api/playlists/{playlist}", headers=newbie, json={"is_public": False})
    assert client.get(f"/api/playlists/{playlist}", headers=john).status_code == 404
    assert client.get(f"/api/playlists/{playlist}").status_code == 404
    assert client.get(f"/api/playlists/{playlist}", headers=newbie).status_code == 200


def test_follow_and_delete(client, newbie, john, playlist):
    assert client.put(f"/api/playlists/{playlist}/follow", headers=john).status_code == 204
    assert client.get(f"/api/playlists/{playlist}").json()["followers"] == 1
    assert client.delete(f"/api/playlists/{playlist}", headers=newbie).status_code == 204
    assert client.get(f"/api/playlists/{playlist}", headers=newbie).status_code == 404


def test_my_playlists(client, newbie, playlist):
    mine = client.get("/api/me/playlists", headers=newbie).json()
    assert [p["id"] for p in mine] == [playlist]
