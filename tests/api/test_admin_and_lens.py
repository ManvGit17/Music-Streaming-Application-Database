"""Admin workspace and the SQL Lens."""

from __future__ import annotations


def test_listeners_cannot_use_admin_routes(client, john):
    assert client.get("/api/admin/overview", headers=john).status_code == 403
    assert client.get("/api/admin/overview").status_code == 401


def test_overview(client, admin):
    body = client.get("/api/admin/overview", headers=admin).json()
    assert body["counts"]["tracks"] > 100
    assert body["plays_last_30_days"]
    assert len(body["top_tracks"]) == 5
    assert body["partitions"] and all(
        p["name"].startswith("listening_event_") for p in body["partitions"]
    )


def test_artist_edit_is_audited(client, admin):
    artist = client.get("/api/artists", params={"limit": 1}).json()[0]
    res = client.patch(
        f"/api/admin/artists/{artist['id']}",
        headers=admin,
        json={"bio": "Edited by the test suite"},
    )
    assert res.status_code == 200
    entry = client.get("/api/admin/audit", headers=admin, params={"table": "artist"}).json()[0]
    assert entry["actor"] == "admin"
    assert entry["db_role"] == "vamusic_admin"
    assert entry["after"]["bio"] == "Edited by the test suite"


def test_refresh(client, admin):
    rows = client.get("/api/admin/overview", headers=admin)  # warm up
    assert rows.status_code == 200
    timings = client.post("/api/admin/refresh", headers=admin).json()
    assert {t["view_name"] for t in timings} >= {"trending_track", "catalog_search"}


def test_lens_off_by_default(client):
    body = client.get("/api/genres").json()
    assert isinstance(body, list)


def test_lens_trace(client, john):
    body = client.get("/api/me", headers=john, params={"lens": "1"}).json()
    assert body["data"]["username"] == "john_doe"
    lens = body["lens"]
    assert lens["role"] == "vamusic_listener"
    statements = [s["sql"] for s in lens["statements"]]
    assert statements[0] == "SET LOCAL ROLE vamusic_listener"
    assert any("listener_tier" in s for s in statements)
    assert all("plan" not in s for s in lens["statements"])


def test_lens_plan_shows_triggers_and_writes_once(client, newbie):
    track = client.get("/api/search", params={"q": "Ocean Waves"}).json()[0]
    body = client.post(
        "/api/me/plays",
        headers=newbie,
        params={"lens": "plan"},
        json={"track_id": track["id"], "ms_played": 1000},
    ).json()
    insert = next(s for s in body["lens"]["statements"] if s["sql"].startswith("INSERT"))
    assert insert["plan"]["Node Type"] == "ModifyTable"
    assert "listening_event_count_insert" in {t["name"] for t in insert["triggers"]}
    # The plan ran in a rolled-back savepoint, so exactly one play was recorded.
    history = client.get("/api/me/history", headers=newbie).json()
    assert len(history) == 1
