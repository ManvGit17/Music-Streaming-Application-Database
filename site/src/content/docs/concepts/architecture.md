---
title: Architecture
description: How a request travels from the interface to PostgreSQL and back, on a server or in the browser.
sidebar:
  order: 1
---

VaMusic puts its rules in the database and keeps the layers above it thin. The API and the web
app decide _which_ query to run; PostgreSQL decides what the caller may see, keeps the counters
right and computes the rankings.

## The pieces

```
              ┌────────────── web app (React) ──────────────┐
              │   pages  →  data layer  →  named query       │
              └──────────────┬───────────────────┬───────────┘
                    HTTP     │                   │  postMessage
                             ▼                   ▼
              ┌─────── FastAPI + psycopg ─┐  ┌──── Web Worker ────┐
              │ one transaction a request │  │ PGlite (Postgres   │
              │ SET LOCAL ROLE, user id   │  │ 18 in WebAssembly) │
              └─────────────┬─────────────┘  └─────────┬──────────┘
                            ▼                          ▼
              ┌───────────────── same SQL ──────────────────────┐
              │ db/migrations/*.sql     db/queries/*.sql         │
              └──────────────────────────────────────────────────┘
```

## One set of queries

Every query lives in a named block in `db/queries/*.sql`:

```sql
-- name: similar
-- Nearest neighbours by audio features, through the HNSW index.
SELECT c.*, s.similarity AS score, 'sounds like' AS reason
FROM vamusic.track src
CROSS JOIN LATERAL vamusic.similar_tracks(src.track_id, :limit) s
JOIN vamusic.track_card c ON c.track_id = s.track_id
WHERE src.public_id = CAST(:id AS uuid)
ORDER BY s.similarity DESC;
```

The Python loader turns `:id` into psycopg's `%(id)s`; the browser turns it into PGlite's `$1`.
Routes and pages contain no SQL of their own. A test fails if the API calls a query that doesn't exist or a query
goes unused, so the two sides can't drift apart.

## A request on the server

1. The route asks for a database session. The dependency borrows a pooled connection and opens a
   transaction.
2. It switches to the caller's role and records who they are, both for this transaction only:

   ```sql
   SET LOCAL ROLE vamusic_listener;
   SELECT set_config('vamusic.user_id', '42', true);
   ```

3. The route runs one or more named queries. Row-level security policies compare rows against
   `vamusic.current_user_id()`, so a query can't return another listener's private rows even if
   the route had a bug.
4. The transaction commits and the connection goes back to the pool. Because both settings were
   transaction-local, the next request starts clean; a test checks this.

The API's login role, `vamusic_app`, owns nothing and is `NOINHERIT`: on its own it can only call
the login and sign-up functions. See [Security](../security/).

## A request in the browser

The web app's data layer has two implementations behind one interface. With `VITE_API_URL` set
it calls the API. Without it, it posts the query name and parameters to a Web Worker running
PGlite, which applies the same role switch and runs the same SQL. See
[The in-browser database](../in-browser-database/).

## Where the logic lives

| Concern | Where |
| :-- | :-- |
| Who may see or change a row | Row-level security policies and column privileges |
| Play, like and listener counts | Statement-level triggers over transition tables |
| Trending, daily plays, monthly listeners | Materialized views refreshed concurrently |
| Search ranking | `search_tracks()`: full text, trigrams and Reciprocal Rank Fusion |
| Recommendations | `similar_tracks()` and `recommend_tracks()` over pgvector |
| Reading password hashes, sign-up | `SECURITY DEFINER` functions with pinned `search_path` |
| Change history | One generic audit trigger writing JSONB |
| Request validation, bcrypt checks, tokens | The API (Pydantic, bcrypt, JWT) |
