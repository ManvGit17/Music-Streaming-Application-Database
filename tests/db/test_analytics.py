"""Rollups, trending, the v1 functions and Wrapped."""

from __future__ import annotations

from decimal import Decimal

import pytest


def test_trending_is_never_empty_for_old_data(db):
    """v1 measured windows from NOW(), so trending emptied a week after seeding."""
    assert db.value("SELECT count(*) FROM trending_track") > 0
    anchor = db.value("SELECT max(anchor_at) FROM trending_track")
    assert anchor == db.value("SELECT max(played_at) FROM listening_event")


def test_trending_ranks_are_dense_from_one(db):
    ranks = [r["rank"] for r in db.rows("SELECT rank FROM trending_track ORDER BY rank LIMIT 5")]
    assert ranks[0] == 1
    assert ranks == sorted(ranks)


def test_refresh_reports_every_rollup(db):
    names = {r["view_name"] for r in db.rows("SELECT * FROM refresh_analytics()")}
    assert names == {
        "daily_track_play",
        "trending_track",
        "artist_monthly_listener",
        "catalog_search",
    }


def test_daily_rollup_matches_raw_events(db):
    assert db.value("SELECT sum(plays) FROM daily_track_play") == db.value(
        "SELECT count(*) FROM listening_event"
    )


@pytest.mark.parametrize(
    ("ms", "label"),
    [(59_000, "0:59"), (3_725_000, "1:02:05"), (0, "0:00")],
)
def test_format_duration(db, ms, label):
    assert db.value("SELECT format_duration(%s)", (ms,)) == label


def test_listener_tier_for_new_listener(db):
    """v1 bug D2: listeners with no history were 'Music Master'."""
    uid = db.value("INSERT INTO app_user (username) VALUES ('brand_new') RETURNING user_id")
    assert db.value("SELECT listener_tier(%s)", (uid,)) == "New Listener"


def test_monthly_revenue_spans_year_boundaries(db):
    """v1 bug D3: comparing month and year separately undercounted later years."""
    db.rows("DELETE FROM subscription")
    db.rows(
        "INSERT INTO subscription (user_id, plan_id, active_during) VALUES "
        "(1, 3, '[2024-11-10,)'), (2, 2, '[2025-01-05,2025-03-01)')"
    )
    assert db.value("SELECT monthly_revenue('2024-12-01')") == Decimal("9.99")
    assert db.value("SELECT monthly_revenue('2025-02-01')") == Decimal("14.98")
    assert db.value("SELECT monthly_revenue('2025-03-01')") == Decimal("9.99")


def test_wrapped_document(db):
    wrapped = db.value("SELECT listener_wrapped(1, 2026)")
    assert wrapped["year"] == 2026
    assert wrapped["plays"] == db.value(
        "SELECT count(*) FROM listening_event WHERE user_id = 1 "
        "AND played_at >= '2026-01-01' AND played_at < '2027-01-01'"
    )
    assert len(wrapped["top_tracks"]) <= 5
    assert 1 <= wrapped["top_percent"] <= 100
    shares = [g["share"] for g in wrapped["top_genres"]]
    assert shares == sorted(shares, reverse=True)
    assert wrapped["longest_streak"]["days"] >= 1


def test_wrapped_streak_uses_consecutive_days(db):
    uid = db.value("INSERT INTO app_user (username) VALUES ('streaker') RETURNING user_id")
    for day in ("2026-02-01", "2026-02-02", "2026-02-03", "2026-02-07"):
        db.rows(
            "INSERT INTO listening_event (user_id, track_id, played_at, ms_played) "
            "VALUES (%s, 1, %s, 60000)",
            (uid, f"{day} 12:00Z"),
        )
    streak = db.value("SELECT listener_wrapped(%s, 2026)", (uid,))["longest_streak"]
    assert streak == {"days": 3, "from": "2026-02-01", "to": "2026-02-03"}


def test_wrapped_for_a_quiet_year(db):
    wrapped = db.value("SELECT listener_wrapped(1, 2019)")
    assert wrapped["plays"] == 0
    assert wrapped["top_tracks"] == []
