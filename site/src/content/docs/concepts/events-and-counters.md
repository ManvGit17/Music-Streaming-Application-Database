---
title: Events, counters and analytics
description: A partitioned event store, counters that cost one statement, and rollups refreshed without blocking readers.
sidebar:
  order: 3
---

Every play is a row in `listening_event`. That table only ever grows, and everything popular in
the app (play counts, trending, monthly listeners, Wrapped) is derived from it. This page covers
how it stays fast as it grows.

## Monthly partitions

`listening_event` is range-partitioned by month: `listening_event_2026_10`,
`listening_event_2026_11` and so on, plus a `DEFAULT` partition that should stay empty.

- Queries with a time range only touch the months they need. This is partition pruning, and a
  test checks the plan for it.
- An old month can be detached or archived in one step instead of a huge `DELETE`.
- Rows arrive roughly in time order, so a **BRIN** index on `played_at` (a few pages per
  partition) does the job of a much larger B-tree.

The partition key must be part of the primary key, hence `PRIMARY KEY (event_id, played_at)`.
`ensure_listening_partitions()` creates months ahead of time; `vamusic migrate` keeps a year
ready.

## Counters without hot loops

The 2025 version ran row-level triggers on every listen, and two of them re-scanned the
listening history to recompute scores. The cost of one insert grew with the size of the table.

Version 2 keeps running totals in `track_stat` and `user_stat`, maintained by statement-level
triggers that read a **transition table**:

```sql
CREATE TRIGGER listening_event_count_insert AFTER INSERT ON listening_event
    REFERENCING NEW TABLE AS new_events
    FOR EACH STATEMENT EXECUTE FUNCTION listening_event_count_insert();
```

The function aggregates `new_events` once and applies one `UPDATE` per affected track and
listener. A matching trigger handles deletes, and likes work the same way. Inserting 10,000 events with `COPY` costs one aggregate, not 10,000 trigger calls.

### Measured

[`scripts/bench_counters.py`](https://github.com/ManvGit17/Music-Streaming-Application-Database/blob/master/scripts/bench_counters.py)
loads the same data into two PostgreSQL 18 databases, one with a faithful port of the old
row-level triggers:

| Existing history | Operation | Old row triggers | Statement triggers | Speed-up |
| :-- | :-- | --: | --: | --: |
| 60k events | insert 10,000 events | 5.52 s | 0.14 s | **38×** |
| 60k events | single insert, median | 1.30 ms | 0.79 ms | 1.7× |
| 1M events | insert 10,000 events | 13.72 s | 0.19 s | **73×** |
| 1M events | single insert, median | 1.89 ms | 0.85 ms | 2.2× |
| 1M events | single insert, p95 | 3.77 ms | 1.43 ms | 2.6× |

The old cost grows with the history and the new one doesn't, which is why the gap widens at a
million events. One limit remains: a very popular track's `track_stat` row is a point of
contention under heavy concurrent writes. A real service would shard those counters or buffer
them through a queue; at this project's scale it isn't needed.

## Rollups as materialized views

Anything defined over a time window lives in a materialized view:

| View | What it holds |
| :-- | :-- |
| `daily_track_play` | Plays and listeners per track per day |
| `trending_track` | Exponentially decayed plays (half-life three days), plus listeners and recent likes |
| `artist_monthly_listener` | Distinct listeners per artist over the last 28 days |
| `catalog_search` | The search documents described in [Search](../search/) |

Each has a unique index, so `refresh_analytics()` can run `REFRESH MATERIALIZED VIEW
CONCURRENTLY` without blocking readers. It returns how long each refresh took; the admin
workspace has a button for it, and so does `vamusic refresh`.

Time windows are measured from the newest event in the data rather than from `now()`. With live
traffic the two are the same. For a demo dataset generated last month, it means trending still
shows something instead of an empty list.

## Year in review

`listener_wrapped(user_id, year)` returns a listener's whole year as one JSON document from a
single query: totals with `GROUPING SETS`, top artists and tracks, the longest listening streak
(a gaps-and-islands query over distinct days), and where the listener ranks against everyone
else with `percent_rank`. The **Your year** page in the app is a view of that document.
