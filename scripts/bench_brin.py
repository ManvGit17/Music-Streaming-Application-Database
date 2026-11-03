"""Compare the BRIN index on listening_event.played_at with a B-tree on the same column.

The schema uses BRIN because plays arrive roughly in time order, so each block range covers a
narrow slice of time. This script checks that claim: it loads a dataset, builds a B-tree next to
the BRIN index, and reports both indexes' sizes and the time of one-hour, one-day and one-week
range queries with each index on its own, and with neither (partition pruning only).

    uv run python scripts/bench_brin.py --scale full

It starts its own PostgreSQL 18 container (Docker required).
"""

from __future__ import annotations

import argparse
import os
import platform
import statistics
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
from testcontainers.community.postgres import PostgresContainer

from vamusic.db.migrations import migrate
from vamusic.seed.generator import generate
from vamusic.seed.loader import load

RANGE_QUERY = """
SELECT count(*), sum(ms_played)
FROM vamusic.listening_event
WHERE played_at >= %(end)s - %(width)s::interval AND played_at < %(end)s
"""

WIDTHS = ("1 hour", "1 day", "7 days")

SUMMARIZE = """
SELECT coalesce(sum(brin_summarize_new_values(relid)), 0)
FROM pg_partition_tree('vamusic.listening_event_played_brin'::regclass)
WHERE isleaf
"""

INDEX_SIZE = """
SELECT coalesce(sum(pg_relation_size(relid)), 0)
FROM pg_partition_tree(%s::regclass)
"""


def index_size(conn: psycopg.Connection[Any], name: str) -> int:
    row = conn.execute(INDEX_SIZE, (f"vamusic.{name}",)).fetchone()
    assert row is not None
    return int(row[0])


def scan_types(plan: dict[str, Any]) -> set[str]:
    kind = plan["Node Type"]
    found = {kind} if "Scan" in kind or kind.startswith("Gather") else set()
    for child in plan.get("Plans", []):
        found |= scan_types(child)
    return found


@contextmanager
def without(conn: psycopg.Connection[Any], *indexes: str) -> Iterator[None]:
    """Hide indexes for the duration of a transaction that is rolled back afterwards."""
    with conn.transaction(force_rollback=True):
        for name in indexes:
            if name.endswith("_pkey"):
                conn.execute(f"ALTER TABLE vamusic.listening_event DROP CONSTRAINT {name}".encode())
            else:
                conn.execute(f"DROP INDEX vamusic.{name}".encode())
        yield


def time_query(
    conn: psycopg.Connection[Any], end: Any, width: str, runs: int
) -> tuple[float, set[str]]:
    params = {"end": end, "width": width}
    for _ in range(2):  # warm the cache
        conn.execute(RANGE_QUERY.encode(), params).fetchall()
    times = []
    for _ in range(runs):
        began = time.perf_counter()
        conn.execute(RANGE_QUERY.encode(), params).fetchall()
        times.append((time.perf_counter() - began) * 1000)
    row = conn.execute(("EXPLAIN (FORMAT JSON) " + RANGE_QUERY).encode(), params).fetchone()
    assert row is not None
    return statistics.median(times), scan_types(row[0][0]["Plan"])


def measure(conn: psycopg.Connection[Any], end: Any, runs: int) -> dict[str, Any]:
    return {w: time_query(conn, end, w, runs) for w in WIDTHS}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--scale", choices=["tiny", "web", "demo", "full"], default="full")
    parser.add_argument("--runs", type=int, default=21)
    args = parser.parse_args()

    with PostgresContainer("pgvector/pgvector:pg18", driver=None) as pg:
        url = pg.get_connection_url()
        with psycopg.connect(url) as conn:
            migrate(conn)
            started = time.perf_counter()
            load(conn, generate(args.scale), summarize=False)
            print(f"loaded the {args.scale} dataset in {time.perf_counter() - started:.0f} s")

        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute(
                "CREATE INDEX listening_event_played_btree ON vamusic.listening_event (played_at)"
            )
            conn.execute("ANALYZE vamusic.listening_event")
            events, latest = conn.execute(
                "SELECT count(*), max(played_at) FROM vamusic.listening_event"
            ).fetchone() or (0, None)
            # Ranges end at the start of the last day of data, where traffic is highest.
            end = conn.execute("SELECT date_trunc('day', %s::timestamptz)", (latest,)).fetchone()[0]  # type: ignore[index]
            rows_in = {
                w: conn.execute(RANGE_QUERY.encode(), {"end": end, "width": w}).fetchone()[0]  # type: ignore[index]
                for w in WIDTHS
            }
            month = conn.execute(
                """SELECT count(*) FROM vamusic.listening_event
                   WHERE played_at >= date_trunc('month', %s::timestamptz)
                     AND played_at < date_trunc('month', %s::timestamptz) + interval '1 month'""",
                (end, end),
            ).fetchone()[0]  # type: ignore[index]
            brin = index_size(conn, "listening_event_played_brin")
            btree = index_size(conn, "listening_event_played_btree")

        # The other indexes that end in played_at are hidden throughout: (user_id, played_at),
        # (track_id, played_at) and the primary key (event_id, played_at). PostgreSQL 18's skip
        # scan can use any of them for a time range, which would blur the comparison.
        others = (
            "listening_event_user_idx",
            "listening_event_track_idx",
            "listening_event_pkey",
        )
        results = {}
        with (
            psycopg.connect(url) as conn,
            without(conn, *others, "listening_event_played_btree"),
        ):
            results["BRIN, as loaded"] = measure(conn, end, args.runs)
        # A BRIN index made before a bulk load has no summaries for the loaded pages, and a scan
        # must read every unsummarized range. VACUUM or brin_summarize_new_values() builds them.
        with psycopg.connect(url, autocommit=True) as conn:
            summarized = conn.execute(SUMMARIZE).fetchone()[0]  # type: ignore[index]
            brin_after = index_size(conn, "listening_event_played_brin")
        with psycopg.connect(url) as conn:
            with without(conn, *others, "listening_event_played_btree"):
                results["BRIN, summarized"] = measure(conn, end, args.runs)
            with without(conn, *others, "listening_event_played_brin"):
                results["B-tree"] = measure(conn, end, args.runs)
            with without(
                conn, *others, "listening_event_played_brin", "listening_event_played_btree"
            ):
                results["No index"] = measure(conn, end, args.runs)

    cpu = platform.processor() or platform.machine()
    print(f"\n{events:,} events; the month queried holds {month:,}")
    print(
        f"PostgreSQL 18 in Docker on {platform.system()} {platform.release()}, {cpu}, "
        f"{os.cpu_count()} logical CPUs; median of {args.runs} warm runs\n"
    )
    print(
        f"Index sizes: BRIN {brin / 1024:,.0f} KB ({brin_after / 1024:,.0f} KB after summarizing "
        f"{summarized:,} ranges), B-tree {btree / 1024:,.0f} KB\n"
    )
    print("| Range | Rows | BRIN, as loaded | BRIN, summarized | B-tree | No index |")
    print("| :-- | --: | --: | --: | --: | --: |")
    for w in WIDTHS:
        cells = " | ".join(f"{results[k][w][0]:.2f} ms" for k in results)
        print(f"| {w} | {rows_in[w]:,} | {cells} |")
    print("\nPlans:")
    for k, by_width in results.items():
        for w, (_, scans) in by_width.items():
            print(f"  {k:<17} {w:<7} {', '.join(sorted(scans))}")


if __name__ == "__main__":
    main()
