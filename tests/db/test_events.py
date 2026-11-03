"""Partitioned event store and the statement-level counters."""

from __future__ import annotations


def stats(db, track_id):
    return db.rows(
        "SELECT play_count, completed_count, ms_played, like_count "
        "FROM track_stat WHERE track_id = %s",
        (track_id,),
    )[0]


def test_seed_events_land_in_monthly_partitions(db):
    assert db.value("SELECT count(*) FROM listening_event_default") == 0
    partitions = db.value(
        "SELECT count(*) FROM pg_inherits WHERE inhparent = 'vamusic.listening_event'::regclass"
    )
    assert partitions == 48 + 1  # 2024-01 .. 2027-12, plus the default


def test_event_is_routed_to_its_month(db):
    db.rows(
        "INSERT INTO listening_event (user_id, track_id, played_at, ms_played) "
        "VALUES (1, 1, '2026-03-15 12:00Z', 1000)"
    )
    assert (
        db.value(
            "SELECT count(*) FROM listening_event_2026_03 WHERE played_at = '2026-03-15 12:00Z'"
        )
        == 1
    )


def test_batch_insert_updates_counters_once_per_statement(db):
    before = stats(db, 5)
    db.rows("""
        INSERT INTO listening_event (user_id, track_id, played_at, ms_played, completed)
        SELECT u, 5, '2026-10-01 10:00Z'::timestamptz + u * interval '1 minute', 1000, u % 2 = 0
        FROM generate_series(1, 10) AS u
    """)
    after = stats(db, 5)
    assert after["play_count"] == before["play_count"] + 10
    assert after["completed_count"] == before["completed_count"] + 5
    assert after["ms_played"] == before["ms_played"] + 10_000


def test_counters_follow_deletes(db):
    db.rows(
        "INSERT INTO listening_event (user_id, track_id, played_at, ms_played) "
        "VALUES (3, 7, '2026-10-02 10:00Z', 5000)"
    )
    before = stats(db, 7)
    db.rows(
        "DELETE FROM listening_event WHERE user_id = 3 AND track_id = 7 "
        "AND played_at = '2026-10-02 10:00Z'"
    )
    assert stats(db, 7)["play_count"] == before["play_count"] - 1


def test_user_stats(db):
    before = db.value("SELECT play_count FROM user_stat WHERE user_id = 4")
    db.rows(
        "INSERT INTO listening_event (user_id, track_id, played_at, ms_played) "
        "VALUES (4, 1, '2026-10-03 10:00Z', 1000), (4, 2, '2026-10-03 10:05Z', 1000)"
    )
    assert db.value("SELECT play_count FROM user_stat WHERE user_id = 4") == (before or 0) + 2


def test_like_counter(db):
    db.rows("DELETE FROM track_like WHERE track_id = 9")
    base = stats(db, 9)["like_count"]
    db.rows("INSERT INTO track_like (user_id, track_id) VALUES (1, 9), (2, 9)")
    assert stats(db, 9)["like_count"] == base + 2
    db.rows("DELETE FROM track_like WHERE user_id = 1 AND track_id = 9")
    assert stats(db, 9)["like_count"] == base + 1


def test_counters_match_a_full_recount(db):
    mismatches = db.value("""
        SELECT count(*) FROM track_stat ts
        LEFT JOIN (SELECT track_id, count(*) AS n FROM listening_event GROUP BY track_id) e
            USING (track_id)
        WHERE ts.play_count <> coalesce(e.n, 0)
    """)
    assert mismatches == 0


def test_ensure_partitions_is_idempotent(db):
    assert db.value("SELECT ensure_listening_partitions('2026-01-01', '2026-06-01')") == 0
    assert db.value("SELECT ensure_listening_partitions('2028-01-01', '2028-03-01')") == 2


def test_time_range_queries_prune_partitions(db):
    plan = "\n".join(
        r["QUERY PLAN"]
        for r in db.rows(
            "EXPLAIN SELECT count(*) FROM listening_event "
            "WHERE played_at >= '2026-03-01' AND played_at < '2026-04-01'"
        )
    )
    assert "listening_event_2026_03" in plan
    assert "listening_event_2026_04" not in plan
