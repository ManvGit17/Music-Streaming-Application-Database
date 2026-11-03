---
title: The in-browser database
description: How the demo runs PostgreSQL 18 in WebAssembly with the server's own migrations and queries.
sidebar:
  order: 7
---

The hosted demo has no server. It runs [PGlite](https://pglite.dev), PostgreSQL 18 compiled to
WebAssembly, in a Web Worker, with the pgvector, pg_trgm, unaccent and btree_gist extensions.

## Same SQL, not a copy

The web app imports the repository's `db/migrations/*.sql` and `db/queries/*.sql` at build time.
The worker applies the migrations exactly as `vamusic migrate` does, and the data layer runs the
same named queries as the API, with the same `SET LOCAL ROLE` and user id at the start of each
transaction. Row-level security, triggers, materialized views and the HNSW index all behave as
they do on the server.

## First visit

1. The worker opens a database in IndexedDB, named after a hash of the migrations and the
   dataset.
2. It applies every migration, then loads the generated dataset (250 listeners, about 1,650
   tracks and 20,000 listening events) from gzipped files with `COPY`.
3. It refreshes the materialized views, runs `ANALYZE` so the planner has statistics, and
   writes a marker row.

The whole build is a single transaction. PostgreSQL's DDL is transactional, so closing the tab
half-way through leaves nothing behind and the next visit simply starts again. Progress for each
step is shown on screen.

## Later visits

If the marker row exists, the database opens straight from IndexedDB with no rebuild.
When a new deploy changes a migration or the dataset, the hash changes, the app builds a fresh
database and removes the old one.

If IndexedDB isn't available (some private browsing modes), the database runs in memory for the
session.

## The few differences

- **Signing in.** On the server the API checks bcrypt hashes in Python. In the browser there is
  no API, so the worker installs `pgcrypto` and checks the same hashes with `crypt()` in SQL.
- **Time.** Rankings are anchored to the newest event in the data rather than the clock, which
  keeps the demo's numbers meaningful whenever you open it. The server does the same.
- **One request at a time.** Requests are queued, because a single PGlite instance runs one
  transaction at a time.

## Why bother

A database project is easier to evaluate when nobody has to install anything. With the real
database in the page, the SQL Lens shows real plans from real PostgreSQL, not a simulation, and
anyone can try to break the row-level security from their own browser.
