"""Roles, row-level security and the audit log.

Each test switches the transaction to a request role, exactly as the API does, and checks that
the database itself (not application code) refuses access to other listeners' data.
"""

from __future__ import annotations

import psycopg
import pytest

ALICE, BOB = 1, 2


def test_listener_sees_only_their_own_account(db):
    db.act_as("vamusic_listener", ALICE)
    rows = db.rows("SELECT user_id FROM user_account")
    assert [r["user_id"] for r in rows] == [ALICE]


def test_profiles_are_public_but_accounts_are_not(db):
    db.act_as("vamusic_anon")
    assert db.value("SELECT count(*) FROM app_user") > 10
    err = db.fails("SELECT email FROM user_account")
    assert isinstance(err, psycopg.errors.InsufficientPrivilege)


@pytest.mark.parametrize("table", ["track_like", "artist_follow", "listening_event", "user_stat"])
def test_private_activity_is_hidden(db, table):
    db.act_as("vamusic_listener", ALICE)
    others = db.value(f"SELECT count(*) FROM {table} WHERE user_id <> %s", (ALICE,))
    assert others == 0


def test_listener_cannot_record_plays_for_someone_else(db):
    db.act_as("vamusic_listener", ALICE)
    err = db.fails(
        "INSERT INTO listening_event (user_id, track_id, ms_played) VALUES (%s, 1, 1)", (BOB,)
    )
    assert "row-level security" in str(err)
    db.rows(
        "INSERT INTO listening_event (user_id, track_id, ms_played) VALUES (%s, 1, 1)", (ALICE,)
    )


def test_listener_counters_still_update_globally(db):
    """Counter triggers run as SECURITY DEFINER, so a listener's play moves the global count."""
    before = db.value("SELECT play_count FROM track_stat WHERE track_id = 3")
    db.act_as("vamusic_listener", ALICE)
    db.rows(
        "INSERT INTO listening_event (user_id, track_id, ms_played) VALUES (%s, 3, 1)", (ALICE,)
    )
    assert db.value("SELECT play_count FROM track_stat WHERE track_id = 3") == before + 1


def test_listener_cannot_change_their_role(db):
    db.act_as("vamusic_listener", ALICE)
    err = db.fails("UPDATE user_account SET role = 'admin' WHERE user_id = %s", (ALICE,))
    assert isinstance(err, psycopg.errors.InsufficientPrivilege)
    db.rows("UPDATE user_account SET birth_date = '1999-09-09' WHERE user_id = %s", (ALICE,))


def test_listener_cannot_edit_another_profile(db):
    db.act_as("vamusic_listener", ALICE)
    db.rows("UPDATE app_user SET display_name = 'hacked' WHERE user_id = %s", (BOB,))
    db.reset_role()
    assert db.value("SELECT display_name FROM app_user WHERE user_id = %s", (BOB,)) != "hacked"


def test_private_playlists_are_hidden_and_others_are_read_only(db):
    private = db.value(
        "INSERT INTO playlist (owner_id, name, is_public) "
        "VALUES (%s, 'secret', false) RETURNING playlist_id",
        (BOB,),
    )
    public = db.value(
        "INSERT INTO playlist (owner_id, name, is_public) "
        "VALUES (%s, 'shared', true) RETURNING playlist_id",
        (BOB,),
    )
    db.rows("SELECT playlist_add_track(%s, 1)", (private,))

    db.act_as("vamusic_listener", ALICE)
    assert db.value("SELECT count(*) FROM playlist WHERE playlist_id = %s", (private,)) == 0
    assert db.value("SELECT count(*) FROM playlist_track WHERE playlist_id = %s", (private,)) == 0
    assert db.value("SELECT count(*) FROM playlist WHERE playlist_id = %s", (public,)) == 1

    err = db.fails("SELECT playlist_add_track(%s, 2)", (public,))
    assert isinstance(err, psycopg.errors.NoDataFound)
    db.rows("DELETE FROM playlist WHERE playlist_id = %s", (public,))
    db.reset_role()
    assert db.value("SELECT count(*) FROM playlist WHERE playlist_id = %s", (public,)) == 1


def test_listener_cannot_create_playlists_for_others(db):
    db.act_as("vamusic_listener", ALICE)
    err = db.fails("INSERT INTO playlist (owner_id, name) VALUES (%s, 'x')", (BOB,))
    assert "row-level security" in str(err)


def test_wrapped_only_reports_on_the_caller(db):
    db.act_as("vamusic_listener", ALICE)
    mine = db.value("SELECT my_wrapped(2026)")
    assert mine["plays"] > 0
    err = db.fails("SELECT listener_wrapped(%s, 2026)", (BOB,))
    assert isinstance(err, psycopg.errors.InsufficientPrivilege)


def test_anon_cannot_write(db):
    db.act_as("vamusic_anon")
    err = db.fails("INSERT INTO track_like (user_id, track_id) VALUES (1, 1)")
    assert isinstance(err, psycopg.errors.InsufficientPrivilege)


def test_admin_sees_everything(db):
    db.act_as("vamusic_admin", 11)
    assert db.value("SELECT count(DISTINCT user_id) FROM user_account") > 10
    assert db.value("SELECT count(DISTINCT user_id) FROM listening_event") > 10


def test_only_the_api_role_can_look_up_password_hashes(db):
    db.act_as("vamusic_listener", ALICE)
    err = db.fails("SELECT * FROM auth_lookup('john_doe')")
    assert isinstance(err, psycopg.errors.InsufficientPrivilege)
    db.reset_role()
    db.rows("SET LOCAL ROLE vamusic_app")
    row = db.rows("SELECT username, role FROM auth_lookup('JOHN@email.com')")[0]
    assert row == {"username": "john_doe", "role": "listener"}


def test_admin_changes_are_audited_without_secrets(db):
    db.act_as("vamusic_admin", 11)
    db.rows("UPDATE artist SET is_verified = NOT is_verified WHERE artist_id = 1")
    db.rows("UPDATE user_account SET password_hash = 'x', is_active = false WHERE user_id = 5")
    db.reset_role()
    log = db.rows("SELECT * FROM audit.change_log ORDER BY change_id DESC LIMIT 2")
    account, artist = log
    assert artist["table_name"] == "artist" and artist["actor_id"] == 11
    assert set(artist["before"]) == {"is_verified", "updated_at"}
    assert account["db_role"] == "vamusic_admin"
    assert "password_hash" not in account["before"] and "password_hash" not in account["after"]
    assert account["after"]["is_active"] is False


def test_request_context_does_not_leak_between_transactions(seeded):
    with psycopg.connect(seeded) as conn:
        with conn.transaction():
            conn.execute("SELECT set_config('vamusic.user_id', '1', true)")
        value = conn.execute("SELECT vamusic.current_user_id()").fetchone()
        assert value == (None,)
