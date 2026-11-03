# Good first issues

Small, well-scoped tasks for a first contribution. Each lists where to look and what "done"
means. Comment on the matching GitHub issue (or open one) before you start, so two people don't
pick the same task. The [contributing guide](../CONTRIBUTING.md) explains setup and tests.

Labels: **db** (SQL and migrations), **api** (Python), **web** (React), **docs**.

---

### 1. Show the partition each listening event lives in · db, api

`GET /api/me/history` returns plays from the partitioned `listening_event` table, but not which
monthly partition each row came from. Add `tableoid::regclass AS partition` to the
`library.history` query and the `Play` schema.

- **Where:** `db/queries/library.sql`, `src/vamusic/api/schemas.py`
- **Done when:** the field appears in the API response, the OpenAPI document is regenerated
  (`uv run vamusic openapi`), and an API test checks the value looks like
  `vamusic.listening_event_2026_10`.

### 2. A `vamusic partitions` command · db, api

Admins can see listening partitions in the web app, but not from the CLI. Add a subcommand that
prints each partition with its row count and size, reusing the `admin.partitions` query.

- **Where:** `src/vamusic/cli.py`
- **Done when:** `uv run vamusic partitions` prints a table like `vamusic refresh` does, and a
  test calls `main(["partitions"])` against the test database.

### 3. Suggest tracks when a search finds nothing · web

When a search has no results, the page says so and nothing else. Suggest three trending
tracks instead, using the existing `useTrending` hook.

- **Where:** `web/src/pages/Search.tsx`
- **Done when:** the empty state shows suggestions, and an end-to-end test searches for
  `zzzzzz` and sees them.

### 4. Copy a statement from the SQL Lens · web

Each statement in the SQL Lens drawer shows its SQL, but there's no quick way to copy it. Add a
copy button with an accessible name and a toast on success.

- **Where:** `web/src/lens/`
- **Done when:** the button copies the SQL with parameters inlined as comments, and the axe
  tests still pass.

### 5. Explain the plan node types · web, docs

Plan trees show node types such as `Bitmap Heap Scan` and `Memoize` without explanation. Add a
short tooltip for the 15 most common node types.

- **Where:** `web/src/lens/`, a new `planNodes.ts` map
- **Done when:** hovering or focusing a node type shows one plain-English sentence, and a unit
  test covers the lookup (including an unknown type).

### 6. Test that trending decays · db

`trending_track` weights recent plays more heavily, with a three-day half-life, but no test
checks the decay itself.

- **Where:** `tests/db/test_analytics.py`
- **Done when:** a test inserts plays for two tracks at different ages, refreshes the views, and
  asserts the order and the approximate score ratio.

### 7. List a listener's subscription history · db, api

Listeners can see their current plan on `GET /api/me`, but not their past subscriptions and
payments, even though row-level security already limits both tables to their owner.

- **Where:** a new named query in `db/queries/auth.sql`, a route and schema in
  `src/vamusic/api/`
- **Done when:** `GET /api/me/subscriptions` returns each period with its plan and payments, and
  a test checks that a listener never sees anyone else's rows.

### 8. Document every function with `COMMENT ON` · db, docs

Some functions have a `COMMENT ON FUNCTION`; many don't. Add comments to the remaining ones in a
new migration, and list functions without a comment in a test so it stays that way.

- **Where:** a new `db/migrations/0011_function_comments.sql`, `tests/db/`
- **Done when:** the test queries `pg_proc` joined to `pg_description` for the `vamusic` schema
  and finds no function without a comment.

### 9. Copy a playlist's link · web

Public playlists can be shared, but there's no button for it. Add a "Copy link" action to the
playlist header that copies the page URL and shows a toast.

- **Where:** `web/src/components/CollectionHeader.tsx`, `web/src/pages/Playlist.tsx`
- **Done when:** the action appears only on public playlists, works with the keyboard, and an
  end-to-end test checks the toast.

### 10. Back the FAQ answers with runnable examples · docs

Several FAQ answers describe behaviour that a reader could check with one query. Add a short
snippet to each: an API call with `?lens=1`, or SQL to run with `psql` against the Compose
stack.

- **Where:** `site/src/content/docs/faq.md`
- **Done when:** each new snippet has been run against the Compose stack and its output matches
  the text.

### 11. Show the request role in the top bar · web

The SQL Lens shows which database role each request ran as. Show the current role as a small
badge next to the avatar so people notice the switch when they sign in as admin.

- **Where:** `web/src/components/` (top bar)
- **Done when:** the badge reads `anon`, `listener` or `admin`, has an accessible label, and an
  end-to-end test checks it after signing in.

### 12. Benchmark the BRIN index against a B-tree · db, docs

The docs claim a BRIN index on `played_at` does the job of a much larger B-tree. Measure it:
index size and query time for a one-week range at the `full` scale.

- **Where:** `scripts/`, then a short section in `docs/database.md`
- **Done when:** a script prints both sizes and timings, and the docs report the numbers with
  the machine they were measured on.
