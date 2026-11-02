# Roadmap

_Proposed 2026-11-02. Based on [audit.md](audit.md) and [research.md](research.md)._

## Positioning

> **VaMusic is a music streaming platform built database-first on PostgreSQL 18, with an
> interface that shows the SQL behind every click.**

The database is the product. The UI is there to make it feel real and to show how it works:
every action can be opened in a "SQL Lens" that shows the statement, the triggers that fired and
the query plan. The same schema runs in Docker and, through PGlite, directly in the browser, so
anyone can try it without installing anything.

## Recommended stack

| Layer | Choice | Why |
| :-- | :-- | :-- |
| Database | **PostgreSQL 18** + `pgvector` + `pg_trgm` | Covers partitioning, RLS, FTS, vectors, `uuidv7()` and virtual generated columns in one engine; MySQL 9's vector support is first-generation (see research §3). |
| Migrations | Plain, numbered `.sql` files plus a small runner | Keeps the SQL front and centre for a DBMS project, and the same files load into PGlite. |
| API | **Python 3.13 + FastAPI + psycopg 3** (async, pooled) | Keeps the project in Python, the original language; thin layer, because the logic lives in SQL functions and views. |
| Tests | `pytest` + Testcontainers (real Postgres 18) | Every trigger, function, view and RLS policy tested against the real engine, not mocks. |
| Web app | **React 19 + TypeScript + Vite**, Tailwind CSS v4, Radix primitives, Motion | Mainstream, fast, accessible primitives; Motion gives smooth, interruptible animation. |
| Demo mode | **PGlite** (Postgres in WASM) | Runs the real schema in the browser, so the demo is actual SQL, not mocked JSON. |
| Hosting | Docker Compose locally; GitHub Pages for the demo | Free; no secrets. |
| Audio | Deterministic generative audio (Web Audio API), plus optional local files | Every track actually plays, with no copyrighted or licensed audio in the repo. |

The original Tkinter apps and MySQL schema move to `legacy/` with their critical bugs fixed, so
the 2025 course submission still runs exactly as submitted, just without the crashes.

## Features

Ranked by impact for a database-focused portfolio project.

### F1. PostgreSQL 18 core with realistic scale — **L**, risk: medium

- Port the schema to Postgres 18 and fix the design bugs found in the audit: merge the duplicate
  like and follow tables (D1), make functions correctly `STABLE` (D6), fix tier and revenue logic
  (D2, D3), and give tracks a real `release_date` (D10).
- Identity primary keys internally, `uuidv7()` public IDs in the API.
- `listening_event` as a **monthly range-partitioned** table with a BRIN index on time.
- Numbered SQL migrations, so the schema evolves without `DROP DATABASE` (D11).
- A **deterministic data generator** (fixed seed): about 200 artists, 2,000 tracks, 5,000 users and
  roughly 1M listening events, so indexes and plans behave realistically.
- Bcrypt hashes in the seed, so demo accounts can actually log in (A2).

_Why:_ This is the base everything else depends on, and it answers N1 and N6.
_Risk:_ The port touches every object; tests are written against the current MySQL behaviour
first, so each behaviour change is deliberate and documented.

### F2. Analytics engine without trigger write amplification — **M**, risk: low

- Replace the per-listen triggers that re-scan history (D5) with **incremental counters** plus
  **materialized-view rollups** refreshed with `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
- Time-decayed trending score (exponential decay with a configurable half-life), computed
  relative to the latest data rather than `NOW()`, so trending never goes empty (D4).
- A "Wrapped"-style yearly recap built with window functions, `GROUPING SETS`, `FILTER` clauses
  and `percentile_cont`.
- A short benchmark write-up: insert latency and plan cost, old triggers vs new design, at 1M rows.

_Why:_ Shows the difference between OLTP writes and analytical reads, with measured results.

### F3. Hybrid search and "sounds like" recommendations — **M**, risk: medium

- Full-text search via a stored generated `tsvector` column with a GIN index, plus `pg_trgm`
  for typo tolerance ("beyonse" → "Beyoncé").
- Each track gets a small **audio-feature vector** (tempo, energy, valence, danceability,
  acousticness and similar), produced deterministically by the generator. A `pgvector` HNSW
  index powers "sounds like this", artist radio, and playlist continuation.
- One SQL function fuses lexical and vector rankings with **Reciprocal Rank Fusion**.
- _Optional AI, off by default:_ "describe a vibe" search using Transformers.js
  (`all-MiniLM-L6-v2`) running in the browser. No API key and no server cost.

_Why:_ Vector search next to relational data, in one engine, is the most in-demand database
skill right now (N4).
_Risk:_ HNSW behaviour in PGlite needs checking early; if it's unsupported there, the demo uses
an exact (non-indexed) nearest-neighbour scan, which is fine at demo scale.

### F4. Security by design — **M**, risk: low

- Separate roles: `vamusic_api` (no table ownership), `vamusic_listener`, `vamusic_admin`.
- **Row-level security** on playlists, likes, follows and history, using `USING` and
  `WITH CHECK` policies keyed on a transaction-local setting, so it resets before the pooled
  connection is reused. _(Decided during PR 1: request roles never own tables, so RLS always
  applies to them without `FORCE`; that lets narrowly scoped `SECURITY DEFINER` functions, owned
  by the schema owner, handle login and global counters. See docs/database.md.)_
- A generic audit trigger that writes JSONB before/after diffs for admin changes.
- Admin login (A5); no credentials in the repository (A4); config through environment variables.
- Tests that try to read and write another listener's data and must fail.

_Why:_ This answers N5, closes audit findings A4 and A5, and shows production-grade thinking.

### F5. SQL Lens and zero-install demo — **M/L**, risk: medium

- A **SQL Lens** drawer on every screen: the exact statement and parameters, triggers fired, rows
  touched, timing, and an `EXPLAIN (ANALYZE, BUFFERS)` plan rendered as an interactive tree.
- **Schema Atlas**: an interactive ER diagram generated live from the system catalogs.
- **Demo mode**: the full app on GitHub Pages running on PGlite, with data in IndexedDB.
- Admin workspace: CRUD for every entity, plus a `pg_stat_statements`-style view of the
  slowest queries (Docker mode).

_Why:_ This is the "innovative interface" and what makes the project memorable (N2, N3).

## Delivery: three phased pull requests

Each PR is tested, CI-green and merged before the next one starts.

| PR | Branch | Contents | Done when |
| :-- | :-- | :-- | :-- |
| **1. Foundation** | `modernize/foundation` | These docs; `legacy/` with critical fixes; Postgres 18 schema, migrations and generator (F1); analytics engine (F2); RLS, roles and audit (F4); FastAPI service; pytest + Testcontainers; CI (lint, types, tests, CodeQL, dependency audit); pre-commit; Dependabot; Docker Compose; LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, templates | `docker compose up` gives a working API on generated data; all DB objects have tests; CI green |
| **2. Experience** | `modernize/experience` | Design system and React app; player with generative audio; search and recommendations UI (F3); SQL Lens and Schema Atlas (F5); PGlite demo mode; GitHub Pages deploy; accessibility pass (keyboard, WCAG AA, reduced motion, light/dark) | Live demo URL works with no setup; Lighthouse accessibility ≥ 95 |
| **3. Launch** | `modernize/launch` | README as a landing page; docs site (Astro Starlight); logo and social preview; screenshots and GIF; CHANGELOG; good-first-issues; launch drafts; `MODERNIZATION_SUMMARY.md` | No placeholders or broken links; repo topics, description and homepage set |

## What this supports on a résumé

Numbers come from `scripts/bench_counters.py` and the test suite (PR 1).

- Designed a PostgreSQL 18 schema for a music streaming platform (19+ tables, monthly-partitioned
  event store with BRIN indexes) and load-tested it with ~1M generated listening events.
- Replaced per-row trigger rescans with statement-level triggers over transition tables and
  materialized-view rollups: bulk event ingest 73× faster and single-insert median latency 2.2×
  lower at 1M events (measured).
- Built hybrid search (full-text + trigram + pgvector HNSW, fused with Reciprocal Rank Fusion)
  and vector-similarity recommendations entirely in SQL.
- Enforced per-user data isolation with row-level security and least-privilege roles, verified
  by automated tests against a real Postgres instance.
- Shipped a zero-install browser demo by running the production schema in WebAssembly Postgres
  (PGlite), with a SQL Lens that shows queries, triggers and execution plans live.

## Out of scope (for now)

- Federation, Subsonic API compatibility, transcoding: that's what Navidrome and Funkwhale are for.
- TimescaleDB: its license restricts hosting, and core Postgres covers the same concepts.
- pg_duckdb columnar analytics: worth a stretch issue later; it isn't available in PGlite.
- Mobile apps.
