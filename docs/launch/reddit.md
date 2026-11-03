# Reddit drafts

_Check each subreddit's self-promotion rules before posting, and post in one or two at most.
Reply to comments for the first few hours._

---

## r/PostgreSQL

**Title:** We rebuilt our DBMS course project on Postgres 18; the demo runs it in the browser
with PGlite and shows every query plan

**Body:**

> Our database course project last year was a music streaming app in MySQL. We rebuilt it on
> PostgreSQL 18 to see how far we could push the logic into the database, and to make that
> work visible.
>
> Demo (no install; Postgres runs in your tab via PGlite):
> https://manvgit17.github.io/Music-Streaming-Application-Database/
>
> Every screen has a "SQL Lens" showing the statements it ran, the EXPLAIN ANALYZE tree and the
> triggers that fired. Some of what's in there:
>
> - `listening_event` range-partitioned by month with BRIN on the timestamp
> - counters via `AFTER INSERT ... REFERENCING NEW TABLE ... FOR EACH STATEMENT` triggers.
>   Inserting 10k events into a 1M-row history went from 13.7 s with the old row triggers to
>   0.19 s
> - materialized views refreshed `CONCURRENTLY` for trending and monthly listeners
> - prefix tsquery + `strict_word_similarity`, fused with Reciprocal Rank Fusion
> - pgvector HNSW on an expression, `(centred(features)::vector(8))`, with
>   `hnsw.iterative_scan = relaxed_order` for filtered recommendations
> - RLS on all per-user tables, `SET LOCAL ROLE` per request, definer functions with pinned
>   `search_path`, a JSONB audit trigger
> - `uuidv7()`, a virtual generated column, an exclusion constraint on subscription date ranges
>
> Two things that surprised us: per-schema `ALTER DEFAULT PRIVILEGES` can't revoke EXECUTE from
> PUBLIC (our tests caught listeners being able to call the password lookup), and the
> `::vector(8)` cast is needed in the index expression because function results lose their
> type modifier.
>
> Design notes: https://github.com/ManvGit17/Music-Streaming-Application-Database/blob/master/docs/database.md
>
> Feedback on the schema very welcome, especially anything you'd do differently at scale.

---

## r/learnprogramming or r/compsci (student angle)

**Title:** Our database course project worked in the demo and broke in four ways once we added
real data. Here's what we changed.

**Body:**

> Last year's DBMS project: a music streaming app with MySQL and Tkinter. This year we audited
> it properly and found that the app didn't start, no seeded user could log in, likes were
> stored in two tables that disagreed, and the trending page went blank a week after loading the
> data.
>
> We rebuilt it on PostgreSQL 18 with tests against a real database, a data generator that can
> produce a million plays, and a web app that shows you the SQL behind every screen. The demo
> runs PostgreSQL in your browser, so there's nothing to install:
> https://manvgit17.github.io/Music-Streaming-Application-Database/
>
> What we'd suggest to anyone doing a database project:
>
> 1. Generate a lot of data. Our triggers were fine with a few sample rows and slow with a
>    million.
> 2. Write tests that try to read other users' data. Our first security setup had a hole we'd
>    never have spotted by reading it.
> 3. Measure before writing "faster" anywhere.
> 4. Keep the old version running so you can compare honestly.
>
> Code is MIT-licensed, and there's a list of good first issues if you want to contribute:
> https://github.com/ManvGit17/Music-Streaming-Application-Database
