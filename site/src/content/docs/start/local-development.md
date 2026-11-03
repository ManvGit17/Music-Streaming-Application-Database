---
title: Local development
description: Set up the repository, run the tests and find your way around.
sidebar:
  order: 3
---

## Requirements

- [uv](https://docs.astral.sh/uv/) for Python 3.13 and its dependencies
- Docker, for the test databases and `docker compose`
- Node 24, for the web app and this documentation site

## Set up

```bash
git clone https://github.com/ManvGit17/tuple-beat.git
cd tuple-beat
uv sync
uv run pre-commit install
```

To run the API against your own PostgreSQL 18 (with pgvector) instead of Compose, set
`VAMUSIC_DATABASE_URL` and use the CLI:

```bash
uv run vamusic migrate --app-password dev-app-password
uv run vamusic seed --scale tiny
uv run vamusic serve --reload
```

## The `vamusic` command

| Command | What it does |
| :-- | :-- |
| `vamusic migrate` | Applies pending migrations and keeps a year of monthly partitions ready |
| `vamusic seed --scale demo` | Generates and loads a dataset into an empty database |
| `vamusic export` | Writes the dataset as gzipped `COPY` files for the browser demo |
| `vamusic refresh` | Refreshes the analytics materialized views and prints their timings |
| `vamusic partitions` | Lists the `listening_event` partitions with estimated rows and size |
| `vamusic serve` | Runs the HTTP API |
| `vamusic openapi` | Writes the OpenAPI document this site's API reference is built from |

## Repository layout

| Path | Contents |
| :-- | :-- |
| `db/migrations/` | The schema, as numbered SQL files applied once each |
| `db/queries/` | Every query the API runs, shared with the in-browser demo |
| `src/vamusic/` | API, CLI, migration runner and data generator |
| `web/` | The web app: React 19, TypeScript, Tailwind CSS v4, PGlite |
| `site/` | This documentation site (Astro Starlight) |
| `tests/` | Tests against real PostgreSQL 18 and MySQL 8.4 containers |
| `legacy/` | The original 2025 MySQL and Tkinter project |
| `docs/` | Audit, research, roadmap and design notes |

## Running the checks

The Python tests start their own database containers, so Docker must be running.

```bash
uv run pytest -m "not legacy"   # schema, API, generator (about 30 s)
uv run pytest -m legacy         # the original MySQL project (about 45 s)
uv run ruff check src tests && uv run mypy
```

The web app has its own:

```bash
cd web
npm run lint && npm run typecheck && npm test
npm run build && npx playwright test   # end-to-end and accessibility tests
```

CI runs all of these on every pull request, plus a Compose smoke test and a dependency audit.

## Working on these docs

```bash
cd site
npm install
npm run dev      # http://localhost:4321/docs/
```

If you change an API route, regenerate the reference with `uv run vamusic openapi`. A test fails
if the committed `site/openapi.json` is out of date.
