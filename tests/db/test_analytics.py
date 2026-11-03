"""Rollups, trending, the v1 functions and Wrapped."""

from __future__ import annotations

from datetime import timedelta
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


def test_trending_decays_with_a_three_day_half_life(db):
    """A play three days before the anchor is worth half a play at the anchor."""
    anchor = db.value("SELECT max(played_at) FROM listening_event") + timedelta(days=40)
    # Two tracks with no plays or likes in the 30 days before the new anchor.
    quiet = [
        r["track_id"]
        for r in db.rows(
            """SELECT t.track_id FROM track t
               WHERE NOT EXISTS (SELECT 1 FROM listening_event e WHERE e.track_id = t.track_id
                                 AND e.played_at > %(anchor)s - interval '30 days')
                 AND NOT EXISTS (SELECT 1 FROM track_like l WHERE l.track_id = t.track_id
                                 AND l.liked_at > %(anchor)s - interval '30 days')
               ORDER BY t.track_id LIMIT 2""",
            {"anchor": anchor},
        )
    ]
    fresh, older = quiet
    user = db.value("SELECT min(user_id) FROM app_user")
    db.rows(
        """INSERT INTO listening_event (user_id, track_id, played_at, ms_played, completed)
           VALUES (%(u)s, %(fresh)s, %(anchor)s, 1000, true),
                  (%(u)s, %(older)s, %(anchor)s - interval '3 days', 1000, true)""",
        {"u": user, "fresh": fresh, "older": older, "anchor": anchor},
    )
    db.rows("REFRESH MATERIALIZED VIEW trending_track")

    scores = {
        r["track_id"]: r
        for r in db.rows(
            "SELECT track_id, score, rank FROM trending_track WHERE track_id = ANY(%s)",
            ([fresh, older],),
        )
    }
    assert scores[fresh]["rank"] < scores[older]["rank"]
    # score = 0.5 * decayed plays + 2 * listeners; one listener each, so the decayed parts
    # are (score - 2) / 0.5: 1.0 for the fresh play and 0.5 for the three-day-old one.
    fresh_decayed = (scores[fresh]["score"] - 2) / Decimal("0.5")
    older_decayed = (scores[older]["score"] - 2) / Decimal("0.5")
    assert fresh_decayed == pytest.approx(Decimal(1), abs=Decimal("0.01"))
    assert older_decayed == pytest.approx(Decimal("0.5"), abs=Decimal("0.01"))


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
