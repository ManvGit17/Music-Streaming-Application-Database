# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `GET /api/me/history` names the monthly partition each play is stored in (#8).
- `vamusic partitions` lists listening partitions with estimated rows and size (#9).
- `GET /api/me/subscriptions` returns a listener's subscription periods and payments (#14).
- Migration 0011 gives every function a `COMMENT ON`, enforced by a test (#15).
- A test for trending's three-day half-life (#13).
- A search that finds nothing suggests popular tracks (#10).
- Copy any statement from the SQL Lens, with its parameters as comments (#11).
- Plan nodes in the SQL Lens explain what they do on hover or focus (#12).
- A **Copy link** button on public playlists (#16).
- The top bar shows the database role requests run as (#18).
- The FAQ backs its answers with commands you can run against the Compose stack (#17).
- `scripts/bench_brin.py` compares the BRIN index on play time with a B-tree (#19).

### Changed

- Page sections are regions named by their heading, for screen-reader navigation.

### Fixed

- `generate('full')` failed with "ran out of unique names"; repeated titles are now numbered.
- Freshly seeded databases, including the browser demo, never summarized the BRIN index on play
  time, so it read every block. Migration 0012 adds `summarize_listening_events()`, which runs
  after each bulk load.
- The play-history end-to-end test no longer fails on a busy machine.

## [2.0.0] - 2026-11-03

A rebuild of the 2025 course project on PostgreSQL 18, with a web app, a browser demo and
documentation. The original MySQL and Tkinter version still runs from `legacy/`.

### Added

- **Database** (`db/migrations/`, ten numbered migrations)
  - Listening history in a table range-partitioned by month, with a BRIN index and partitions
    created a year ahead.
  - Play, like and listener counters maintained by statement-level triggers over transition
    tables: 73× faster than the old row triggers for a 10,000-event insert into a million-row
    history.
  - Trending, daily plays and monthly listeners as materialized views refreshed concurrently.
  - Hybrid search: prefix full-text and strict trigram rankings on accent-folded text, fused with
    Reciprocal Rank Fusion.
  - "Sounds like" and taste-based recommendations from 8-dimension audio-feature vectors, using
    centred cosine similarity through a pgvector HNSW expression index.
  - Least-privilege roles, row-level security on every per-listener table, `SECURITY DEFINER`
    functions with pinned `search_path`, and a JSONB audit log that redacts secrets.
  - `uuidv7()` public ids, a virtual generated column, an exclusion constraint against
    overlapping subscriptions, and a deferrable constraint for one-statement playlist reordering.
  - A year-in-review function using `GROUPING SETS`, gaps-and-islands streaks and
    `percent_rank`.
- **API**: FastAPI and psycopg 3, one transaction per request under the caller's database role.
  `?lens=1` and `?lens=plan` return the statements, plans and triggers behind any response.
- **Shared queries**: every query lives in `db/queries/*.sql` and is run unchanged by the API
  and the browser.
- **Web app** (`web/`): React 19, TypeScript and Tailwind CSS v4, with the SQL Lens drawer, the
  Schema Atlas, generated music for every track, a now-playing view with a live spectrum,
  search, playlists with drag-to-reorder, Your year, an admin workspace, light and dark themes
  and keyboard shortcuts.
- **Browser demo**: PostgreSQL 18 in WebAssembly (PGlite) applies the real migrations and loads
  a generated dataset, published to GitHub Pages.
- **Data generator**: deterministic datasets from 6,000 to 1,000,000 listening events.
- **CLI**: `vamusic migrate`, `seed`, `export`, `refresh`, `serve` and `openapi`.
- **Tests**: 168 Python tests against PostgreSQL 18 and MySQL 8.4 containers, including
  row-level security attacks, plan checks and characterization tests for the original project;
  Playwright end-to-end and axe-core accessibility tests.
- **Tooling**: uv, Ruff, mypy (strict), Biome, pre-commit, Docker Compose, GitHub Actions CI,
  CodeQL and Dependabot.
- **Documentation**: a Starlight docs site with an API reference generated from the OpenAPI
  schema, a design write-up, the audit, research and roadmap, contributing guide, code of
  conduct, security policy, issue and pull request templates.
- **Branding**: a logo, wordmark, screenshots, demo animation and social preview image.
- MIT license.

### Changed

- Moved from MySQL 8 to PostgreSQL 18, and from Tkinter desktop apps to a web app and an API.
- Merged duplicate tables: likes and follows each live in exactly one table, so the app and the
  analytics finally agree.
- Split users into a public profile and a private account.
- Trending and recommendation windows are anchored to the newest event in the data, so demo
  data doesn't go blank a week after it is loaded.

### Fixed

In the original project, which is kept runnable in `legacy/`:

- The listener app failed to start because of a stray character.
- No seeded user could log in, because the seed passwords were placeholders.
- Adding a track to a playlist twice crashed the action.
- The admin "Import SQL" button cut trigger and procedure bodies apart and reported success.
- `GetUserTier` ranked brand-new users as "Music Master", and `CalculateMonthlyRevenue` was
  wrong across year boundaries.
- Database credentials are read from environment variables instead of the source code.

### Removed

- The hard-coded database password.
- The course report document, which contained personal details.
- `create_helper_tables.py`, which defined a conflicting `PlaylistTrack` table.

### Security

- The admin routes and workspace require an admin account; the original admin app had no
  sign-in at all.

## [1.0.0] - 2025-11-14

The original database mini project: a MySQL schema with 19 tables,
triggers, stored procedures, functions and views, and Tkinter apps for listeners and admins.

[2.0.0]: https://github.com/ManvGit17/Music-Streaming-Application-Database/compare/caa7066...v2.0.0
[1.0.0]: https://github.com/ManvGit17/Music-Streaming-Application-Database/tree/caa7066
