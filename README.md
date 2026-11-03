# VaMusic

[![CI](https://github.com/ManvGit17/Music-Streaming-Application-Database/actions/workflows/ci.yml/badge.svg)](https://github.com/ManvGit17/Music-Streaming-Application-Database/actions/workflows/ci.yml)
![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL-18-336791?logo=postgresql&logoColor=white)
![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)

**A music streaming platform built database-first on PostgreSQL 18, with an API that can show
you the SQL behind every request.**

VaMusic began in 2025 as a DBMS course project: a MySQL schema with Tkinter desktop apps. Version
2 rebuilds it around the database features a real streaming service depends on, and keeps the
original running in [`legacy/`](legacy/).

## What's inside

| | |
| :-- | :-- |
| **Event store** | Listening history in a table range-partitioned by month, with a BRIN index on time. |
| **Counters without hot loops** | Play, like and listener counts kept by statement-level triggers over transition tables, so a bulk insert or `COPY` updates each counter once. |
| **Analytics** | Trending (time-decayed), daily plays and monthly listeners as materialized views refreshed `CONCURRENTLY`. |
| **Hybrid search** | Prefix full-text search and strict trigram matching on accent-folded text, fused with Reciprocal Rank Fusion: `midnite tran` finds "Midnight Train". |
| **Vector recommendations** | 8-dimension audio-feature vectors in pgvector, compared by centred cosine similarity through an HNSW expression index, for "sounds like" and taste-based recommendations. |
| **Security in the database** | Least-privilege roles, row-level security on every per-listener table, `SECURITY DEFINER` functions with pinned `search_path`, and a JSONB audit log that redacts secrets. |
| **PostgreSQL 18** | `uuidv7()` public ids, a virtual generated column, exclusion constraints over date ranges, deferrable constraints. |
| **SQL Lens** | Add `?lens=1` to any API request to get every statement it ran with timings, or `?lens=plan` for `EXPLAIN ANALYZE` plans and the triggers that fired. |
| **Year in review** | A Wrapped-style recap from one SQL function: `GROUPING SETS`, gaps-and-islands streaks, `percent_rank`, `percentile_cont`. |

The design and the reasoning behind each choice are in [docs/database.md](docs/database.md).

## The web app

A full interface for listeners and admins, in [`web/`](web/). It can talk to the API, or run the
**whole database inside the browser**: PostgreSQL 18 compiled to WebAssembly (PGlite) applies
the same migrations and runs the same SQL files as the server, so there's nothing to install.

- Every song plays: music is generated in the browser from each track's seed and audio features.
- The **SQL Lens** drawer shows each request's statements, parameters, plan tree and the
  triggers it fired.
- The **Schema Atlas** draws the live schema from the system catalogs.
- Search with typo tolerance, vector "sounds like" neighbours, a Wrapped-style year in review,
  playlists with drag-to-reorder, and an admin workspace with partitions and the audit log.
- Dark and light themes, keyboard shortcuts (⌘K, Space, L), reduced-motion support, and no
  serious WCAG 2.1 AA violations in axe-core tests.

```bash
cd web
npm install
npm run seed     # export the demo dataset (needs uv)
npm run dev      # http://localhost:5173, database runs in the browser
```

To use the API instead, start `docker compose up` and run the app with
`VITE_API_URL=http://localhost:8000 npm run dev`.

## Quick start

You need Docker.

```bash
docker compose up
```

That starts PostgreSQL 18, applies the migrations, loads a reproducible demo dataset (400
listeners, about 2,000 tracks, 60,000 plays) and serves the API at
<http://localhost:8000>. Interactive API docs are at <http://localhost:8000/docs>.

Every demo account uses the password `vamusic`. Try `john_doe` as a listener or `admin` for
the admin routes. If port 8000 is taken, set `API_PORT` (see [.env.example](.env.example)).

```bash
curl "http://localhost:8000/api/search?q=midnite%20tran&lens=plan"
```

## Repository layout

| Path | Contents |
| :-- | :-- |
| `db/migrations/` | The schema, as numbered SQL files applied once each |
| `db/queries/` | Every query the API runs, shared with the in-browser demo |
| `src/vamusic/` | API (FastAPI + psycopg 3), CLI, migration runner and data generator |
| `web/` | The web app (React 19, TypeScript, Tailwind CSS v4, PGlite) |
| `tests/` | Database, API and generator tests against real PostgreSQL 18; characterization tests for v1 |
| `legacy/` | The original MySQL + Tkinter project, with its crash bugs fixed |
| `docs/` | Audit, research, roadmap and database design notes |

## Development

```bash
uv sync
uv run pytest -m "not legacy"
uv run vamusic --help
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Roadmap

The database (stage 1) and the web app (stage 2) are done. Stage 3 adds a documentation site,
a hosted demo and project branding. See [docs/roadmap.md](docs/roadmap.md).

## Authors

ManvGit17 and Lohith Anand. The original project was a database mini project (2025).
