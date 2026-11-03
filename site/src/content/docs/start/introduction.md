---
title: Introduction
description: What VaMusic is, where it came from and what it shows.
sidebar:
  order: 1
---

VaMusic is a music streaming app whose logic lives in PostgreSQL 18. It has a catalog of
artists, albums and tracks, listeners with plans and subscriptions, playlists, likes, follows and
a listening history, and it does the work a streaming service needs inside the database:
counting plays, ranking what's trending, searching with typos, recommending tracks that sound
alike and keeping each listener's data private.

It began in 2025 as a database mini project: a MySQL schema with Tkinter desktop
apps. Version 2 rebuilt it around the problems that project never had to face, such as a
listening history with millions of rows and listeners who must not see each other's private
playlists. The original is kept, working, in the repository's `legacy/` folder.

## Two ways to run it

The same schema and the same SQL run in two places:

- **On a server.** A FastAPI service talks to PostgreSQL 18 through psycopg 3. Each request is
  one transaction under a database role chosen for the caller, so row-level security applies to
  every query. `docker compose up` starts everything.
- **In the browser.** [PGlite](https://pglite.dev) is PostgreSQL compiled to WebAssembly. The
  web app runs it in a Web Worker, applies the same migrations, loads a generated dataset and
  answers the same named queries. This is what the hosted demo uses.

## What it shows

The interface is built to make the database visible:

- The **SQL Lens** drawer lists every statement a screen ran, with its parameters, timing,
  `EXPLAIN ANALYZE` plan and the triggers it fired.
- The **Schema Atlas** draws the live schema from the system catalogs, marking partitioned
  tables, generated columns, materialized views and row-level security policies.
- Small labels name the feature behind a section, such as "a taste vector and an HNSW index"
  above your recommendations.

## Who it's for

- **Students** learning databases who want to see indexes, partitions, triggers and policies
  doing real work, not just their syntax.
- **Developers** curious how far you can push logic into PostgreSQL before you need anything
  else.
- **Reviewers** who want to check the work: the claims in these docs point to the tests and the benchmark
  that back them.

Next: [run it](../quick-start/).
