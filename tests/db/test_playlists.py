"""Playlist ordering functions and the deferred position constraint."""

from __future__ import annotations

import psycopg
import pytest


@pytest.fixture
def playlist(db):
    pid = db.value("INSERT INTO playlist (owner_id, name) VALUES (1, 'Test') RETURNING playlist_id")
    for track in (10, 20, 30):
        db.value("SELECT playlist_add_track(%s, %s)", (pid, track))
    return pid


def order(db, pid):
    return [
        r["track_id"]
        for r in db.rows(
            "SELECT track_id FROM playlist_track WHERE playlist_id = %s ORDER BY position", (pid,)
        )
    ]


def test_add_appends_in_order(db, playlist):
    assert order(db, playlist) == [10, 20, 30]


def test_adding_a_duplicate_is_a_no_op(db, playlist):
    """v1 crashed on this; now it reports false."""
    assert db.value("SELECT playlist_add_track(%s, 20)", (playlist,)) is False
    assert order(db, playlist) == [10, 20, 30]


def test_add_to_missing_playlist(db):
    err = db.fails("SELECT playlist_add_track(999999, 1)")
    assert isinstance(err, psycopg.errors.NoDataFound)


def test_reorder_rewrites_positions(db, playlist):
    db.rows("SELECT playlist_reorder(%s, ARRAY[30, 10, 20]::bigint[])", (playlist,))
    assert order(db, playlist) == [30, 10, 20]
    positions = [
        r["position"]
        for r in db.rows(
            "SELECT position FROM playlist_track WHERE playlist_id = %s ORDER BY position",
            (playlist,),
        )
    ]
    assert positions == [1, 2, 3]


@pytest.mark.parametrize(
    "bad",
    [[10, 20], [10, 20, 30, 40], [10, 10, 30], [10, 20, 99]],
    ids=["missing", "extra", "duplicate", "foreign"],
)
def test_reorder_rejects_incomplete_lists(db, playlist, bad):
    err = db.fails("SELECT playlist_reorder(%s, %s::bigint[])", (playlist, bad))
    assert isinstance(err, psycopg.errors.InvalidParameterValue)


def test_remove_closes_the_gap(db, playlist):
    assert db.value("SELECT playlist_remove_track(%s, 20)", (playlist,)) is True
    rows = db.rows(
        "SELECT track_id, position FROM playlist_track WHERE playlist_id = %s ORDER BY position",
        (playlist,),
    )
    assert [(r["track_id"], r["position"]) for r in rows] == [(10, 1), (30, 2)]
    assert db.value("SELECT playlist_remove_track(%s, 20)", (playlist,)) is False


def test_playlist_duration(db, playlist):
    expected = db.value("SELECT sum(duration_ms) FROM track WHERE track_id IN (10, 20, 30)")
    assert db.value("SELECT playlist_duration_ms(%s)", (playlist,)) == expected
