# What my DBMS course project taught me when I rebuilt it on PostgreSQL 18

_Draft blog post. Suggested places: dev.to, Hashnode, Medium, or a personal site._

---

Last year, Lohith Anand and I built VaMusic: a
music streaming service in MySQL with two Tkinter desktop apps. It had 19 tables, triggers,
stored procedures and views.

This year I went back to it on my own and asked a simple question: would any of it survive real
use?

Mostly, it wouldn't. The listener app didn't start (a stray `~` on line 124). No seeded user
could log in, because every password hash was a placeholder. Likes were stored in two different
tables, and the app wrote to one while the trending calculation read the other, so liking a song
never moved it up the charts. The trending list went blank a week after you loaded the data,
because it only counted plays from the last seven days and all the sample plays were stamped
with the import time.

None of this showed up in a demo. All of it would have shown up in a week of real use.

So I rebuilt it. Version 2 is still a database project at heart, but it now runs on
PostgreSQL 18, has a web app, and ships with a demo that runs the real database in your browser.

**Live demo:** https://manvgit17.github.io/Music-Streaming-Application-Database/
**Code:** https://github.com/ManvGit17/Music-Streaming-Application-Database

## Making the database visible

The thing I most wanted to fix was how invisible the database was. In most apps you click a
button and something happens; the SQL, the indexes and the triggers are a black box.

VaMusic has a **SQL Lens**: a drawer that lists every statement the current screen ran, with
its parameters, timing, the `EXPLAIN ANALYZE` plan as a tree, and the triggers that fired. Play a
song and you can watch the counter trigger run. Search for "midnite tran" and you can see which
of the two search rankings found "Midnight Train". The API does the same thing if you add
`?lens=plan` to any request.

There's also a **Schema Atlas**, an ER diagram drawn live from PostgreSQL's system catalogs,
which marks partitioned tables, generated columns, materialized views and row-level security
policies.

## The database work

A few of the changes that taught me the most:

**Counters that don't get slower as you grow.** The old version updated play counts with
row-level triggers, and two of them re-scanned the whole listening history on every insert. I
replaced them with statement-level triggers that read a transition table, aggregate the new
rows once, and apply one update per track. I measured both designs on the same data: inserting
10,000 plays into a million-row history went from 13.7 seconds to 0.19 seconds. A single insert
got about twice as fast. The difference grows with the table, because the old cost depended on
history size and the new one doesn't.

**A table that only grows.** Listening history is range-partitioned by month, with a BRIN index
on the timestamp. Queries for a date range only touch the months they need (a test checks the
plan for partition pruning), and old months can be detached instead of deleted.

**Search that forgives typos.** It runs two rankings, prefix full-text search and trigram
similarity, and combine them with Reciprocal Rank Fusion. One bug from this was instructive:
plain `word_similarity` matches the best _fragment_ of the text, so "midnite tran" ranked a song
containing "...midnight kite..." above "Midnight Train". `strict_word_similarity` fixed it.

**Recommendations with pgvector.** Each track has eight audio features (energy, valence, tempo
and so on) stored as a vector, with an HNSW index. My first version scored every neighbour at
about 99%, which looked impressive and meant nothing: when every coordinate is between 0 and 1,
all vectors point into the same corner, and cosine similarity can't tell them apart. Measuring
from the midpoint 0.5 instead spread the scores out properly.

**Security that doesn't trust the app.** Every request runs as a database role, and row-level
security decides which rows it can see. If a route has a bug, the database still won't return
another listener's private playlists. Writing tests that _attack_ this found three real
problems, including one where `ALTER DEFAULT PRIVILEGES IN SCHEMA` silently did nothing and
listeners could have read password hashes. I wouldn't have found that by reading the docs.

## PostgreSQL in the browser

The demo has no server. It uses PGlite, which is PostgreSQL compiled to WebAssembly, running in
a Web Worker. On your first visit it applies the same migration files the server uses, loads
20,000 generated plays with `COPY`, and stores the result in IndexedDB. The app then runs the
same SQL files as the API.

The whole build is one transaction. If you close the tab halfway through, nothing is left behind.
That only works because PostgreSQL's DDL is transactional, which was a nice moment of the
database design paying for itself in a place I didn't expect.

Every song plays, by the way. There's no audio library; music is generated in the browser from
each track's audio features, so tracks that are close in vector space actually sound alike.

## What I'd tell another student

- **Test with real volume.** The original triggers were fine with a handful of sample rows.
  Generate a million and see what breaks.
- **Write tests that try to break your security.** Policies that look right can be wrong in
  ways you only find by attacking them.
- **Measure before you claim.** I wrote a small benchmark before writing "faster" anywhere.
- **Keep the old version running.** The 2025 project is still in the repository, with tests
  that pin how it behaves. It made every comparison in this post checkable.

## What's still rough

It's a learning project, not a streaming service. The most popular tracks' counters would become
a bottleneck under heavy concurrent writes; a real system would shard them or put a queue in
front. There's no actual music catalog, the in-browser database is single-user, and I haven't
load-tested the API beyond the benchmark.

If you're learning databases and want to poke at something real, the demo is the fastest way
in. The repository has a list of good first issues if you'd like to contribute, and I'd like
to hear what you think, especially what I got wrong.

_ManvGit17. The original 2025 version was built with Lohith Anand._
