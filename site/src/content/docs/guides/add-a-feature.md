---
title: Adding a database feature
description: The path from a new migration to a query, a route, the web app and tests.
sidebar:
  order: 2
---

Most features touch the same layers in the same order. This guide follows one through: a
"recently liked by people you follow" list.

## 1. Write a migration

Add the next numbered file in `db/migrations/`, for example `0011_friend_likes.sql`. Never edit
a migration that has been merged: the runner records a checksum for each file and stops if an
applied one changes.

```sql
SET search_path = vamusic, public;

CREATE FUNCTION friend_likes(p_limit integer DEFAULT 20)
    RETURNS TABLE (track_id bigint, liked_by bigint, liked_at timestamptz)
    LANGUAGE sql STABLE
    SECURITY DEFINER
    SET search_path = vamusic, public
AS $$
    SELECT l.track_id, l.user_id, l.liked_at
    FROM user_follow f
    JOIN track_like l ON l.user_id = f.followee_id
    WHERE f.follower_id = current_user_id()
    ORDER BY l.liked_at DESC
    LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION friend_likes(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION friend_likes(integer) TO vamusic_listener;
```

Things to check in review:

- **Row-level security.** Likes are private to their owner, so a listener can't read their
  friends' likes directly. This function is `SECURITY DEFINER` to look past that, which makes it
  a deliberate privacy decision: is it acceptable to show who liked what? If not, return the
  tracks without `liked_by`.
- **Whose data.** The function reads the caller from `current_user_id()` instead of taking a
  user id argument, so nobody can ask for another listener's feed.
- **`search_path`.** Every function pins it. Definer functions without it can be hijacked.
- **Grants.** Revoke from `PUBLIC`, then grant to the roles that need it.
- **Indexes.** `track_like`'s primary key starts with `user_id`, so each followee's likes are
  found through it, but sorting everyone's likes by `liked_at` happens afterwards. For a listener
  who follows many people an index on `(user_id, liked_at DESC)` may help. Compare the plans
  with `?lens=plan` before adding it.

## 2. Add a named query

Add a block to the right file in `db/queries/`:

```sql
-- name: friend_likes
-- Tracks recently liked by people the caller follows.
SELECT c.*, fl.liked_at
FROM vamusic.friend_likes(:limit) fl
JOIN vamusic.track_card c USING (track_id)
ORDER BY fl.liked_at DESC;
```

Parameters are written `:name`. Casts like `CAST(:id AS uuid)` are fine; `::` is never
mistaken for a parameter.

## 3. Add a route

```python
@router.get("/friend-likes", response_model=list[schemas.Track])
def friend_likes(db: DbSession, _user: CurrentUser, limit: Limit = 20) -> list[Row]:
    """Tracks recently liked by people the signed-in listener follows."""
    return db.q("library.friend_likes", limit=limit)
```

The docstring becomes the endpoint's description in the API reference; a test fails without it.
Run `uv run vamusic openapi` to update `site/openapi.json`.

## 4. Use it in the web app

Add a method to the data layer's interface in `web/src/data/api.ts`, implement it in the HTTP
client (`http.ts`) and the browser client (`browser/api.ts`, which runs the query by name), and
add a TanStack Query hook in `hooks.ts` for pages to use. The SQL Lens picks it up automatically.

## 5. Test it

- `tests/db/`: call the function as each role. A listener should see only their followees'
  likes, and `vamusic_anon` shouldn't be able to call it at all.
- `tests/api/`: hit the route signed in and signed out.
- `tests/test_queries.py` already fails if a query is unused or a route names one that doesn't
  exist.

If the change affects a query plan, put the before and after plans (`?lens=plan`) in the pull
request.
