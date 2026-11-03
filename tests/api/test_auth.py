"""Sign-up, sign-in and profile."""

from __future__ import annotations

from tests.api.conftest import login


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["postgres"].startswith("18")
    assert body["role"] == "vamusic_anon"


def test_register_and_sign_in(client):
    res = client.post(
        "/api/auth/register",
        json={"username": "fresh_ears", "email": "fresh@example.com", "password": "long enough"},
    )
    assert res.status_code == 201
    assert res.json()["role"] == "listener"
    assert login(client, "FRESH@example.com", "long enough")


def test_duplicate_username_is_a_conflict(client):
    res = client.post(
        "/api/auth/register",
        json={"username": "John_Doe", "email": "other@example.com", "password": "long enough"},
    )
    assert res.status_code == 409


def test_register_validation(client):
    res = client.post(
        "/api/auth/register",
        json={"username": "x", "email": "not-an-email", "password": "short"},
    )
    assert res.status_code == 422
    fields = {e["loc"][-1] for e in res.json()["detail"]}
    assert fields == {"username", "email", "password"}


def test_wrong_password(client):
    res = client.post("/api/auth/login", json={"login": "john_doe", "password": "nope"})
    assert res.status_code == 401


def test_unknown_user_gets_the_same_answer(client):
    res = client.post("/api/auth/login", json={"login": "nobody_here", "password": "nope"})
    assert res.status_code == 401
    assert res.json()["detail"] == "wrong username or password"


def test_me_requires_a_token(client):
    assert client.get("/api/me").status_code == 401


def test_bad_token(client):
    res = client.get("/api/me", headers={"Authorization": "Bearer not.a.token"})
    assert res.status_code == 401


def test_me(client, john):
    me = client.get("/api/me", headers=john).json()
    assert me["username"] == "john_doe"
    assert me["email"] == "john@email.com"
    assert me["plays"] > 0


def test_subscription_history_is_the_caller_s_own(client, john, admin, api_urls):
    import psycopg

    owner, _ = api_urls
    with psycopg.connect(owner) as conn:
        periods, payments = conn.execute(
            """SELECT count(DISTINCT s.subscription_id), count(p.payment_id)
               FROM vamusic.subscription s
               JOIN vamusic.app_user u USING (user_id)
               LEFT JOIN vamusic.payment p USING (subscription_id)
               WHERE u.username = 'john_doe'"""
        ).fetchone()
    history = client.get("/api/me/subscriptions", headers=john).json()
    assert len(history) == periods > 0
    assert sum(len(h["payments"]) for h in history) == payments
    assert [h["starts"] for h in history] == sorted((h["starts"] for h in history), reverse=True)
    # Admins can read every subscription, but this route still shows only their own.
    with psycopg.connect(owner) as conn:
        admins = conn.execute(
            """SELECT count(*) FROM vamusic.subscription s
               JOIN vamusic.app_user u USING (user_id) WHERE u.username = 'admin'"""
        ).fetchone()[0]
    assert len(client.get("/api/me/subscriptions", headers=admin).json()) == admins


def test_subscription_history_needs_sign_in(client, newbie):
    assert client.get("/api/me/subscriptions").status_code == 401
    assert client.get("/api/me/subscriptions", headers=newbie).json() == []


def test_update_profile(client, newbie):
    res = client.patch("/api/me", headers=newbie, json={"display_name": "DJ Test", "country": "IN"})
    assert res.status_code == 200
    assert res.json()["display_name"] == "DJ Test"
    assert res.json()["tier"] == "New Listener"
