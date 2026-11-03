"""Compare v1's per-row trigger design with v2's statement-level counters.

v1 ran three AFTER INSERT ... FOR EACH ROW triggers on every listen. Two of them re-scanned the
listening history (recent plays, distinct listeners, favourites, monthly listeners). v2 folds
each INSERT statement into the counters once, using a transition table, and leaves time-windowed
numbers to materialized views.

This script loads the same dataset into two fresh databases, installs a faithful port of the v1
triggers into one of them, and times identical inserts against both.

    uv run python scripts/bench_counters.py --scale demo

It starts its own PostgreSQL 18 container (Docker required).
"""

from __future__ import annotations

import argparse
import statistics
import time

import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from testcontainers.community.postgres import PostgresContainer

from vamusic.db.migrations import migrate
from vamusic.seed.generator import generate
from vamusic.seed.loader import load

# A port of v1's update_play_count + calculate_trending_score triggers (legacy/mysql), adapted
# to the v2 tables. Same per-row work: bump the count, then re-scan history for the scores.
V1_TRIGGERS = """
SET search_path = vamusic, public;
ALTER TABLE track_stat ADD COLUMN trending_score numeric NOT NULL DEFAULT 0;
ALTER TABLE artist ADD COLUMN monthly_listeners integer NOT NULL DEFAULT 0;

CREATE FUNCTION v1_listen() RETURNS trigger LANGUAGE plpgsql
    SET search_path = vamusic, public AS $$
DECLARE
    v_recent int; v_listeners int; v_favs int;
BEGIN
    UPDATE track_stat SET play_count = play_count + 1, last_played_at = NEW.played_at
    WHERE track_id = NEW.track_id;

    UPDATE artist a SET monthly_listeners = (
        SELECT count(DISTINCT e.user_id) FROM listening_event e
        JOIN track t2 ON t2.track_id = e.track_id JOIN album al2 ON al2.album_id = t2.album_id
        WHERE al2.artist_id = a.artist_id AND e.played_at > now() - interval '30 days')
    FROM album al JOIN track t ON t.album_id = al.album_id
    WHERE al.artist_id = a.artist_id AND t.track_id = NEW.track_id;

    SELECT count(*) INTO v_recent FROM listening_event
    WHERE track_id = NEW.track_id AND played_at > now() - interval '7 days';
    SELECT count(DISTINCT user_id) INTO v_listeners FROM listening_event
    WHERE track_id = NEW.track_id AND played_at > now() - interval '30 days';
    SELECT count(*) INTO v_favs FROM track_like WHERE track_id = NEW.track_id;
    UPDATE track_stat SET trending_score = v_recent * 0.5 + v_listeners * 2 + v_favs * 1.5
    WHERE track_id = NEW.track_id;
    RETURN NULL;
END $$;

ALTER TABLE listening_event DISABLE TRIGGER listening_event_count_insert;
CREATE TRIGGER v1_listen AFTER INSERT ON listening_event
    FOR EACH ROW EXECUTE FUNCTION v1_listen();
"""

BATCH = """
INSERT INTO vamusic.listening_event (user_id, track_id, played_at, ms_played, completed)
SELECT 1 + (g * 7919) %% %(users)s, 1 + (g * 104729) %% %(tracks)s,
       now() - (g %% 1440) * interval '1 minute', 180000, true
FROM generate_series(1, %(n)s) AS g
"""

SINGLE = """
INSERT INTO vamusic.listening_event (user_id, track_id, ms_played, completed)
VALUES (%(user)s, %(track)s, 180000, true)
"""


def database(base: str, name: str) -> str:
    with psycopg.connect(base, autocommit=True) as conn:
        conn.execute(f"CREATE DATABASE {name}")
    return make_conninfo(**{**conninfo_to_dict(base), "dbname": name})


def measure(url: str, users: int, tracks: int, batch: int, singles: int) -> dict[str, float]:
    with psycopg.connect(url) as conn:
        # Warm up caches the same way for both designs.
        conn.execute("SELECT count(*) FROM vamusic.listening_event")

        t0 = time.perf_counter()
        with conn.transaction(force_rollback=True):
            conn.execute(BATCH, {"users": users, "tracks": tracks, "n": batch})
        batch_s = time.perf_counter() - t0

        latencies = []
        with conn.transaction(force_rollback=True):
            for i in range(singles):
                t0 = time.perf_counter()
                conn.execute(SINGLE, {"user": 1 + i % users, "track": 1 + (i * 31) % tracks})
                latencies.append((time.perf_counter() - t0) * 1000)
    return {
        "batch_seconds": batch_s,
        "single_median_ms": statistics.median(latencies),
        "single_p95_ms": statistics.quantiles(latencies, n=20)[18],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--scale", default="demo", choices=["tiny", "demo", "full"])
    parser.add_argument("--batch", type=int, default=10_000)
    parser.add_argument("--singles", type=int, default=300)
    args = parser.parse_args()

    dataset = generate(args.scale)
    users, tracks = len(dataset.users), len(dataset.tracks)
    with PostgresContainer("pgvector/pgvector:pg18", driver=None) as pg:
        base = pg.get_connection_url()
        results = {}
        for design in ("v1", "v2"):
            url = database(base, f"bench_{design}")
            with psycopg.connect(url) as conn:
                migrate(conn)
                load(conn, dataset)
                if design == "v1":
                    conn.execute(V1_TRIGGERS)
                    conn.commit()
            results[design] = measure(url, users, tracks, args.batch, args.singles)

    events = len(dataset.events)
    print(f"\nscale={args.scale}: {events:,} existing events, {tracks:,} tracks, {users:,} users")
    print(f"{'':28}{'v1 row triggers':>18}{'v2 statement':>16}{'speed-up':>10}")
    for key, label in [
        ("batch_seconds", f"insert {args.batch:,} rows (s)"),
        ("single_median_ms", "single insert, median (ms)"),
        ("single_p95_ms", "single insert, p95 (ms)"),
    ]:
        v1, v2 = results["v1"][key], results["v2"][key]
        print(f"{label:28}{v1:>18.3f}{v2:>16.3f}{v1 / v2:>9.1f}x")


if __name__ == "__main__":
    main()
