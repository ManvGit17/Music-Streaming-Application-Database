---
title: Security in the database
description: Roles, row-level security, definer functions and the audit log.
sidebar:
  order: 6
---

VaMusic assumes the application layer will one day have a bug, and makes sure the database still
refuses to hand one listener's data to another.

## Roles

| Role | Used for |
| :-- | :-- |
| `vamusic_app` | The API's login role. `NOINHERIT` and owns nothing: on its own it can only call the login and sign-up functions. |
| `vamusic_anon` | Signed-out requests |
| `vamusic_listener` | Signed-in listeners |
| `vamusic_admin` | Admins |

Tables and functions are owned by the migration role, never by a role a request can use.

## A role per request

Each API request is one transaction that starts with:

```sql
SET LOCAL ROLE vamusic_listener;
SELECT set_config('vamusic.user_id', '42', true);
```

Both are transaction-local, so nothing carries over to the next request that borrows the same
pooled connection. A test checks exactly that. `vamusic.current_user_id()` reads the setting
back for policies and queries.

## Row-level security

Policies on every table that holds per-listener data compare rows with `current_user_id()`:

- Listeners see only their own account, subscriptions, payments, counters, likes, follows and
  listening history.
- Private playlists and their tracks are invisible to everyone but the owner.
- Writes use `WITH CHECK`, so a listener can't insert a like, a play or a playlist track on
  someone else's behalf.
- Column privileges limit listeners to changing their display name, country, email and birth
  date, so they can't promote themselves to admin.
- Admins have an `admin_all` policy on each table.

The tests sign in as one listener and try to read and change another's likes, history,
account and private playlists; every attempt must fail.

## Definer functions

Some operations must look past a single listener's rows: checking a login, creating an account,
global counters, follower totals, the percentile in Wrapped. Each is a `SECURITY DEFINER`
function with:

- a pinned `search_path`, so a caller can't substitute their own objects (CVE-2018-1058);
- `EXECUTE` revoked from `PUBLIC` and granted only to the roles that need it.

`auth_lookup()` is the only way to read a password hash, and only `vamusic_app` can call it,
before the request switches roles.

## Audit log

`audit.capture()` is one generic trigger function attached to the catalog tables, plans and
accounts. For each change it records the signed-in user, the request role, the table and key,
and, for updates, only the columns that changed, as JSONB. Trigger arguments name columns to
redact, so `password_hash` never reaches the log. Admins can browse it in the admin workspace.

## Three problems the tests found

1. `ALTER DEFAULT PRIVILEGES IN SCHEMA ... REVOKE EXECUTE ... FROM PUBLIC` does nothing, because
   per-schema defaults can only add privileges. Before the fix, listeners could call
   `auth_lookup()` and read password hashes. Fixed by revoking after the functions exist and
   setting the global default.
2. Inside a `SECURITY DEFINER` trigger, `current_user` is the function's owner, so the audit log
   recorded the wrong role. The role chosen by `SET ROLE` is read from
   `current_setting('role')` instead.
3. Functions without a pinned `search_path` broke for callers that didn't set one, and could be
   hijacked by callers who did. Migration 0007 now pins it on every function in the schema.
