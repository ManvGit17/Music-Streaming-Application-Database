---
title: FAQ
description: Common questions about VaMusic.
---

### Is the music real?

No. Every track is generated in your browser with the Web Audio API from the track's seed and
audio features: tempo, energy, valence and so on. Tracks with similar vectors sound similar,
which is a nice way to hear the recommendations working. Artists, albums, tracks and listeners
are all invented.

### Does the demo send my data anywhere?

No. The demo has no server. The database lives in your browser's IndexedDB, and clearing the
site's data removes it.

### Why PostgreSQL and not MySQL, which the original project used?

The features this version is about aren't available in MySQL, or not in the same form:
row-level security, transition tables for statement-level triggers, exclusion constraints,
`CREATE MATERIALIZED VIEW ... REFRESH CONCURRENTLY`, pgvector, pg_trgm, and transactional DDL,
which is what lets the browser build its database in one transaction. The MySQL version still
runs, with characterization tests, in `legacy/`.

### Why put so much logic in the database?

Because the database is the one place every client has to go through. If row-level security
decides who sees a private playlist, a bug in a route can't leak it. If triggers keep the
counters, a bulk import keeps them right too. The trade-off is that SQL is harder to unit-test
and to refactor than application code, which is why the test suite runs against a real
PostgreSQL 18 rather than mocks.

### Would this scale to a real streaming service?

Some parts would and some wouldn't. Partitioning, BRIN, statement-level counters and
materialized views are the techniques large PostgreSQL deployments use. A real service would
also need sharded counters for its most popular tracks, a queue in front of the event store, and
a separate analytics database. The [events page](../concepts/events-and-counters/) discusses
where the limits are.

### What does "PostgreSQL 18" add here?

`uuidv7()` for public ids and virtual generated columns. Everything else, including pgvector
0.8's iterative index scans, would also work on PostgreSQL 16 or 17.

### Can I use this for my own course project?

Yes, under the MIT license. If you're submitting work for a course, follow your course's rules
about reusing code, and credit the project.

### How do I report a bug or a security problem?

Bugs: open an issue on [GitHub](https://github.com/ManvGit17/Music-Streaming-Application-Database/issues).
Security problems: follow the
[security policy](https://github.com/ManvGit17/Music-Streaming-Application-Database/blob/master/SECURITY.md)
instead of opening a public issue.
