"""Characterization tests for legacy/mysql/vamusic_v2.sql.

These pin the behaviour of the original schema as submitted. Where a test pins a known bug, the
docstring names the audit finding (docs/audit.md) so the fix shows up as a deliberate change.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

pytestmark = pytest.mark.legacy


def test_schema_objects_are_created(db):
    def count(kind: str, table: str, column: str = "ROUTINE_TYPE") -> int:
        if table == "ROUTINES":
            return db.value(
                "SELECT COUNT(*) FROM information_schema.ROUTINES "
                "WHERE ROUTINE_SCHEMA='vamusic' AND ROUTINE_TYPE=%s",
                (kind,),
            )
        return db.value(
            f"SELECT COUNT(*) FROM information_schema.{table} WHERE {column}='vamusic'"
        )

    tables = db.value(
        "SELECT COUNT(*) FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA='vamusic' AND TABLE_TYPE='BASE TABLE'"
    )
    assert tables == 19
    assert count("", "TRIGGERS", "TRIGGER_SCHEMA") == 8
    assert count("PROCEDURE", "ROUTINES") == 5
    assert count("FUNCTION", "ROUTINES") == 4
    assert count("", "VIEWS", "TABLE_SCHEMA") == 3


def test_seed_row_counts(db):
    counts = {
        t: db.value(f"SELECT COUNT(*) FROM `{t}`")
        for t in ("User", "Artist", "Album", "Track", "Playlist", "ListeningHistory")
    }
    # The schema comment promises 100 tracks; the INSERT actually has 95.
    assert counts == {
        "User": 10,
        "Artist": 10,
        "Album": 10,
        "Track": 95,
        "Playlist": 10,
        "ListeningHistory": 10,
    }


def test_search_tracks_matches_title_artist_and_album(db):
    (rows,) = db.call("SearchTracks", ("light", None, None, 10, 0))
    assert [r["track_title"] for r in rows] == ["Morning Light", "City Lights", "Northern Lights"]


def test_search_tracks_filters_by_genre(db):
    (rows,) = db.call("SearchTracks", (None, 6, None, 100, 0))  # Jazz
    assert rows
    assert {r["genre_name"] for r in rows} == {"Jazz"}


def test_trending_only_counts_recent_listens(db):
    (rows,) = db.call("GetTrendingTracks", (50,))
    assert {r["track_id"] for r in rows} == {1, 2, 11, 21, 22, 31, 32, 41, 51, 61}
    assert all(r["recent_listeners"] > 0 for r in rows)


def test_recommendations_exclude_recently_played(db):
    (rows,) = db.call("GetUserRecommendations", (1, 50))
    ids = {r["track_id"] for r in rows}
    assert ids
    assert not ids & {1, 2, 11}


def test_listen_trigger_updates_counters(db):
    before = db.value("SELECT play_count FROM Track WHERE track_id=5")
    db.rows(
        "INSERT INTO ListeningHistory (user_id, track_id, playback_duration, completed) "
        "VALUES (7, 5, 200, TRUE)"
    )
    assert db.value("SELECT play_count FROM Track WHERE track_id=5") == before + 1
    assert db.value("SELECT trending_score FROM Track WHERE track_id=5") > 0
    stats = db.rows("SELECT total_minutes, songs_played FROM UserStatistics WHERE user_id=7")[0]
    assert stats == {"total_minutes": 3, "songs_played": 1}


def test_album_track_count_triggers(db):
    db.rows("INSERT INTO Track (track_title, album_id, duration_seconds) VALUES ('X', 10, 100)")
    assert db.value("SELECT total_tracks FROM Album WHERE album_id=10") == 6
    db.rows("DELETE FROM Track WHERE track_title='X'")
    assert db.value("SELECT total_tracks FROM Album WHERE album_id=10") == 5


def test_playlist_follower_triggers(db):
    db.rows("INSERT INTO UserPlaylist (user_id, playlist_id, is_owner) VALUES (9, 1, FALSE)")
    assert db.value("SELECT follower_count FROM Playlist WHERE playlist_id=1") == 2
    db.rows("DELETE FROM UserPlaylist WHERE user_id=9 AND playlist_id=1")
    assert db.value("SELECT follower_count FROM Playlist WHERE playlist_id=1") == 1


def test_subscription_change_is_audited(db):
    db.rows("UPDATE UserSubscription SET subscription_id=3 WHERE user_id=2")
    row = db.rows("SELECT old_plan, new_plan FROM SubscriptionAudit WHERE user_id=2")[0]
    assert row == {"old_plan": "Basic", "new_plan": "Premium"}


def test_create_playlist_with_tracks_is_atomic(db):
    (result,) = db.call("CreatePlaylistWithTracks", (3, "Mix", "desc", True, "1,2,3"))
    assert result[0]["tracks_added"] == 3
    with pytest.raises(Exception):  # noqa: B017 - the procedure re-signals a generic error
        db.call("CreatePlaylistWithTracks", (3, "Broken", "desc", True, "1,99999"))
    assert db.value("SELECT COUNT(*) FROM Playlist WHERE playlist_name='Broken'") == 0


def test_format_duration(db):
    assert db.value("SELECT FormatDuration(59)") == "0:59"
    assert db.value("SELECT FormatDuration(3725)") == "1:02:05"


def test_playlist_duration(db):
    assert db.value("SELECT GetPlaylistDuration(1)") == "20:10"


def test_user_tier_for_listener_with_history(db):
    assert db.value("SELECT GetUserTier(1)") == "Casual Listener"


def test_user_tier_for_new_listener(db):
    """Audit D2 (fixed): a user with no statistics row used to be reported as the top tier."""
    assert db.value("SELECT GetUserTier(10)") == "New Listener"


def test_monthly_revenue_across_year_boundary(db):
    """Audit D3 (fixed): January 2025 used to report less revenue than March 2024."""
    assert db.value("SELECT CalculateMonthlyRevenue(1, 2024)") == Decimal("34.97")
    assert db.value("SELECT CalculateMonthlyRevenue(3, 2024)") == Decimal("72.92")
    assert db.value("SELECT CalculateMonthlyRevenue(1, 2025)") == Decimal("72.92")
    assert db.value("SELECT CalculateMonthlyRevenue(12, 2023)") == Decimal("0.00")


def test_table_reading_functions_are_not_deterministic(db):
    """Audit D6 (fixed): functions that read tables must not claim to be DETERMINISTIC."""
    rows = db.rows(
        "SELECT ROUTINE_NAME, IS_DETERMINISTIC FROM information_schema.ROUTINES "
        "WHERE ROUTINE_SCHEMA='vamusic' AND ROUTINE_TYPE='FUNCTION' ORDER BY ROUTINE_NAME"
    )
    assert {r["ROUTINE_NAME"]: r["IS_DETERMINISTIC"] for r in rows} == {
        "CalculateMonthlyRevenue": "NO",
        "FormatDuration": "YES",
        "GetPlaylistDuration": "NO",
        "GetUserTier": "NO",
    }


def test_likes_and_favorites_are_separate_tables(db):
    """Audit D1: the app writes UserLikedTrack, analytics read UserFavorites."""
    assert db.value("SELECT COUNT(*) FROM UserLikedTrack") == 0
    assert db.value("SELECT COUNT(*) FROM UserFavorites") == 15


def test_seed_users_can_log_in(db):
    """Audit A2 (fixed): seed passwords used to be placeholders, so nobody could log in."""
    import bcrypt

    hashes = [r["password"] for r in db.rows("SELECT password FROM `User`")]
    assert all(looks_like_bcrypt(h) for h in hashes)
    assert all(bcrypt.checkpw(b"vamusic", h.encode()) for h in hashes)


def looks_like_bcrypt(value: str) -> bool:
    import bcrypt

    try:
        bcrypt.checkpw(b"probe", value.encode())
    except ValueError:
        return False
    return len(value) == 60 and value.startswith(("$2a$", "$2b$", "$2y$"))


def test_adding_a_track_to_a_playlist_twice_fails(db):
    """Audit A6: the composite key rejects duplicates and the UI doesn't handle it."""
    with pytest.raises(mysql_error()):
        db.rows("INSERT INTO PlaylistTrack (playlist_id, track_id) VALUES (1, 1)")


def mysql_error():
    import mysql.connector

    return mysql.connector.errors.IntegrityError
