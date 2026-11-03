---
title: FAQ
description: Common questions about VaMusic.
---

The examples below run against the Compose stack from the [quick start](../start/quick-start/).
SQL examples use `psql` inside the database container:

```bash
docker compose exec db psql -U vamusic -d vamusic
```

### Is the music real?

No. Every track is generated in your browser with the Web Audio API from the track's seed and
audio features: tempo, energy, valence and so on. Tracks with similar vectors sound similar,
which is a nice way to hear the recommendations working. Artists, albums, tracks and listeners
are all invented.

Each track carries the eight numbers its music is made from:

```bash
curl -s "http://localhost:8000/api/search?q=midnight%20train&limit=1"
```

```json
[{"title": "Midnight Train", "features": [0.635, 0.5704, 0.459, 0.0904, 0.092, 0.0534, 0.1764, 0.6506], ...}]
```

### Does the demo send my data anywhere?

No. The demo has no server. The database lives in your browser's IndexedDB, and clearing the
site's data removes it.

### Why PostgreSQL and not MySQL, which the original project used?

The features this version is about aren't available in MySQL, or not in the same form:
row-level security, transition tables for statement-level triggers, exclusion constraints,
`CREATE MATERIALIZED VIEW ... REFRESH CONCURRENTLY`, pgvector, pg_trgm, and transactional DDL,
which is what lets the browser build its database in one transaction. The MySQL version still
runs, with characterization tests, in `legacy/`.

Transactional DDL in one line: a table created inside a rolled-back transaction never existed.

```sql
BEGIN;
CREATE TABLE scratch (x int);
ROLLBACK;
SELECT to_regclass('scratch') AS scratch;
```

```
 scratch
---------

(1 row)
```

### Why put so much logic in the database?

Because the database is the one place every client has to go through. If row-level security
decides who sees a private playlist, a bug in a route can't leak it. If triggers keep the
counters, a bulk import keeps them right too. The trade-off is that SQL is harder to unit-test
and to refactor than application code, which is why the test suite runs against a real
PostgreSQL 18 rather than mocks.

Row-level security in action: the same query returns every like to the table's owner, and only
Jane's own likes once the session takes on her role, as the API does for each request.

```sql
SELECT count(*) AS every_like FROM vamusic.track_like;

BEGIN;
SET LOCAL ROLE vamusic_listener;
SELECT set_config('vamusic.user_id',
       (SELECT user_id::text FROM vamusic.app_user WHERE username = 'jane_smith'), true);
SELECT count(*) AS likes_jane_can_see FROM vamusic.track_like;
ROLLBACK;
```

```
 every_like
------------
       1379

 likes_jane_can_see
--------------------
                  3
```

### Would this scale to a real streaming service?

Some parts would and some wouldn't. Partitioning, BRIN, statement-level counters and
materialized views are the techniques large PostgreSQL deployments use. A real service would
also need sharded counters for its most popular tracks, a queue in front of the event store, and
a separate analytics database. The [events page](../concepts/events-and-counters/) discusses
where the limits are.

Partition pruning is the part you can see straight away. A one-week query reads only October's
partition, through its BRIN index:

```sql
EXPLAIN (COSTS OFF)
SELECT count(*) FROM vamusic.listening_event
WHERE played_at >= '2026-10-01' AND played_at < '2026-10-08';
```

```
 Aggregate
   ->  Bitmap Heap Scan on listening_event_2026_10 listening_event
         Recheck Cond: ((played_at >= '2026-10-01 ...') AND (played_at < '2026-10-08 ...'))
         ->  Bitmap Index Scan on listening_event_2026_10_played_at_idx
```

`docker compose exec api vamusic partitions` lists every month with its size. The
[BRIN benchmark](../concepts/events-and-counters/#brin-or-b-tree) compares the index with a
B-tree at a million rows.

### What does "PostgreSQL 18" add here?

`uuidv7()` for public ids and virtual generated columns. Everything else, including pgvector
0.8's iterative index scans, would also work on PostgreSQL 16 or 17.

```sql
SELECT uuidv7() AS public_id;
SELECT attname, attgenerated FROM pg_attribute
WHERE attrelid = 'vamusic.track'::regclass AND attgenerated <> '';
```

```
               public_id
--------------------------------------
 01a1a254-52b1-7146-a622-8a93165eb443

     attname      | attgenerated
------------------+--------------
 duration_seconds | v
```

The ids start with a timestamp, so new ones sort last; `v` marks a virtual column, computed when
read and never stored.

### Can I use this for my own course project?

Yes, under the MIT license. If you're submitting work for a course, follow your course's rules
about reusing code, and credit the project.

### How do I report a bug or a security problem?

Bugs: open an issue on [GitHub](https://github.com/ManvGit17/tuple-beat/issues).
Security problems: follow the
[security policy](https://github.com/ManvGit17/tuple-beat/blob/master/SECURITY.md)
instead of opening a public issue.
