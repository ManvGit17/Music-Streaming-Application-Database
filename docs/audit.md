# VaMusic — Project Audit

_Audited on 2026-11-02 against commit `caa7066` (`master`)._

## 1. What the project is

VaMusic is a DBMS course project (PES University, UE23CS351A, 5th semester, 2025) that models a
Spotify-style music streaming service. It has three parts:

| Part | File | Size |
| :--- | :--- | ---: |
| MySQL schema, triggers, procedures, functions, views, seed data | `vamusic_v2.sql` | 1,096 lines |
| Listener desktop app (Tkinter) | `vamusic_user_ui.py` | 404 lines |
| Admin desktop app (Tkinter) | `vamusic_admin_ui.py` | 356 lines |
| Shared DB helpers | `db_utils.py` | 79 lines |
| Helper-table bootstrap script | `create_helper_tables.py` | 46 lines |
| Course report | `VAMusic_Report.docx` | 675 KB |

The database is the strongest part of the project. It has 19 tables, 8 triggers, 5 stored
procedures, 4 stored functions and 3 views, with foreign keys, CHECK constraints, ENUMs, composite
keys and secondary indexes throughout.

## 2. Architecture

```
┌──────────────────────┐     ┌──────────────────────┐
│  vamusic_user_ui.py  │     │ vamusic_admin_ui.py  │   Tkinter, one window each
└──────────┬───────────┘     └──────────┬───────────┘
           │   raw SQL strings + CALL proc(...)    │
           └──────────────┬─────────────────┘
                   ┌──────▼──────┐
                   │ db_utils.py │  new connection per query, autocommit
                   └──────┬──────┘
                   ┌──────▼──────┐
                   │  MySQL 8.x  │  triggers maintain counters and scores
                   └─────────────┘
```

- There is no service layer: UI classes build SQL strings inline, and every query opens and closes
  its own connection.
- Business logic is split between Python (likes, follows, playlists) and SQL (trending score,
  statistics, recommendations), and the two halves use **different tables** for the same concept
  (see §5.2).

## 3. Tech stack and age

| Component | Used | Current (Nov 2026) | Notes |
| :--- | :--- | :--- | :--- |
| Python | 3.x, unpinned | 3.14 | No `pyproject.toml` or `requirements.txt`. |
| GUI | Tkinter + ttk default theme | — | No theming, no dark mode, fixed 1100×700 window, IDs shown to users. |
| DB driver | `mysql-connector-python`, unpinned | 26.10.0 | |
| Hashing | `bcrypt`, unpinned | 5.0.0 | Fine choice. |
| Imaging | `pillow` | — | Listed as a requirement but **never imported**. |
| Database | MySQL 8.x | MySQL 8.4 LTS / 9.x; PostgreSQL 18 | Schema imports cleanly on MySQL 8.4 (verified). |

There is no build tooling, packaging, lockfile, formatter, linter, type checker or test runner.

## 4. Verification method

Everything in §5 was reproduced, not guessed:

- `vamusic_v2.sql` was imported into a disposable `mysql:8.4` Docker container. All 19 tables, 8
  triggers, 5 procedures, 4 functions and 3 views were created. The seed loads 10 users, 10
  artists, 10 albums, **95** tracks (the comment says 100) and 10 playlists.
- Each procedure and function was called with seed data.
- Each Python file was compiled with `python -m py_compile`.
- The admin app's SQL importer was run against `vamusic_v2.sql` offline to see how it splits
  statements.

## 5. Findings

Severity: **Critical** = the app can't be used, **High** = wrong results or data loss,
**Medium** = misleading or fragile, **Low** = hygiene.

### 5.1 The applications

| # | Severity | Finding | Evidence |
| :-- | :-- | :-- | :-- |
| A1 | Critical | **The listener app does not start.** Line 124 ends in a stray `~`, which is a `SyntaxError`. | `vamusic_user_ui.py:124` |
| A2 | Critical | **No seeded user can log in.** Every seed password is the literal placeholder `$2b$10$YourHashedPasswordHere`, which is not a valid bcrypt hash, so `verify_password` always returns `False`. | `vamusic_v2.sql:840-850` |
| A3 | Critical | **The admin "Import SQL" button corrupts the database without reporting it.** It deletes `DELIMITER` lines and then splits on `;`, which cuts all 17 trigger, procedure and function bodies apart. The resulting errors are printed to the terminal and ignored, and the UI reports success. | `vamusic_admin_ui.py:41-50` |
| A4 | High | **Hard-coded database password** (`mysql1234`) committed to a public repository. | `db_utils.py:15` |
| A5 | High | **The admin panel has no authentication.** Anyone who runs it can create, edit or delete any user. | `vamusic_admin_ui.py` |
| A6 | High | **Adding a track to a playlist twice crashes the action** with an unhandled `Duplicate entry` error (composite primary key on `PlaylistTrack`). | `vamusic_user_ui.py:214, 300` |
| A7 | Medium | Personalised recommendations show every track as **liked = "Yes"** (the code comment says the opposite). | `vamusic_user_ui.py:138` |
| A8 | Medium | **Nothing records listening.** The UI never inserts into `ListeningHistory`, so the play-count, statistics and trending triggers never fire from the app. Analytics, recommendations and trending only reflect seed data. | — |
| A9 | Medium | **Follow is half-built.** Users can unfollow artists, but nothing in the UI lets them follow one. | `vamusic_user_ui.py` |
| A10 | Medium | **No playback.** `file_path` values are fake (`/audio/album1/track1.mp3`), and double-clicking hands the path to `webbrowser.open`. | `vamusic_user_ui.py:217-231` |
| A11 | Medium | Picking a playlist means typing its numeric ID into a prompt; raw IDs appear throughout the UI. | `vamusic_user_ui.py:212` |
| A12 | Medium | The admin Albums and Tracks tabs can add rows but not update or delete them; the report says they can. Genres can't be managed at all. | `vamusic_admin_ui.py:253-315` |
| A13 | Low | Dead code: three unused `get_server_info` lines and a `nametowidget(...) if False else` expression. | `vamusic_admin_ui.py:28-31`, `vamusic_user_ui.py:293` |
| A14 | Low | Leftover sandbox path `/mnt/data/va2music.sql`, and the SQL header says to save the file as `va2music_merged.sql`. | `vamusic_admin_ui.py:20`, `vamusic_v2.sql:3` |
| A15 | Low | Every query opens a new connection; there is no pooling, no transaction boundaries and no retry. | `db_utils.py` |

### 5.2 The database

| # | Severity | Finding | Evidence |
| :-- | :-- | :-- | :-- |
| D1 | High | **Duplicate tables for the same concept.** Likes live in `UserLikedTrack` (used by the app) and in `UserFavorites` (used by the trending trigger, `GetTrendingTracks` and `TrackPerformance`). Follows live in `UserFollowArtist` (app) and `UserFollowing` (`ArtistDashboard`). Liking a track in the app therefore never affects trending or dashboards. | Seeded: 0 rows in `UserLikedTrack`, 15 in `UserFavorites`. |
| D2 | High | **`GetUserTier` returns "Music Master" for brand-new users.** When there is no `UserStatistics` row, `SELECT … INTO` leaves the variable `NULL`; every `CASE` comparison is false and execution falls through to `ELSE`. | `SELECT GetUserTier(10)` → `Music Master` |
| D3 | High | **`CalculateMonthlyRevenue` is wrong across year boundaries.** It compares month and year separately, so January 2025 reports **34.97** while March 2024 reports **72.92**, even though no subscription ended in between. | `vamusic_v2.sql:714-731` |
| D4 | Medium | **Trending decays to empty.** `GetTrendingTracks` requires listens in the last 7 days, and the seed history is stamped at import time, so a week after setup the Top view is blank. The same applies to recommendations (30-day window). | `vamusic_v2.sql:644-666` |
| D5 | Medium | Write amplification in triggers: every listen re-scans `ListeningHistory` three times (play count/monthly listeners, trending score) inside the inserting transaction. That's fine for a demo, but it won't scale past toy data. | `vamusic_v2.sql:302-403` |
| D6 | Medium | Functions that read tables are declared `DETERMINISTIC`, which is incorrect and can mislead the optimizer and replication. | `GetUserTier`, `CalculateMonthlyRevenue`, `GetPlaylistDuration` |
| D7 | Medium | `CreatePlaylistWithTracks` parses a comma-separated string inside SQL and throws away the real error with a generic `SIGNAL`. | `vamusic_v2.sql:482-534` |
| D8 | Medium | `create_helper_tables.py` defines `PlaylistTrack` with a **different shape** (surrogate `id`, no foreign keys) from `vamusic_v2.sql`. The script's `CREATE TABLE IF NOT EXISTS` hides the conflict. | `create_helper_tables.py:30-40` |
| D9 | Low | `SET FOREIGN_KEY_CHECKS = 0` for the whole script hides seed-ordering mistakes. | `vamusic_v2.sql:12` |
| D10 | Low | `Track.release_date` is a `TIMESTAMP` defaulting to the insert time, so it isn't a release date. | `vamusic_v2.sql:117` |
| D11 | Low | There is no migration story: the only way to change the schema is `DROP DATABASE` and re-import. | — |

**What's good and worth keeping:** sensible normalisation, real foreign keys with deliberate
`ON DELETE` behaviour, composite keys on junction tables, useful secondary indexes, CHECK
constraints, a transactional procedure with rollback, and analytical views. That's a solid base
to build on.

## 6. Security

| Item | Status |
| :-- | :-- |
| Committed credentials | **Yes**: `db_utils.py` (A4). Rotate that MySQL password anywhere it's reused. |
| SQL injection | Low risk: user input goes through parameterised queries. The stored procedures use `LIKE CONCAT('%', ?, '%')` without escaping `%`/`_`, which is a correctness issue, not an injection. |
| Authentication | bcrypt for listeners (good), none for admins (A5), no rate limiting, no session expiry. |
| Least privilege | The app connects as `root`. |
| Dependency vulnerabilities | Nothing is pinned, so nothing can be audited reproducibly. `pillow` is installed for no reason, which adds attack surface. |
| Personal data in repo | `VAMusic_Report.docx` contains both authors' full names and university registration numbers. Keep it only if both authors are happy with that. |

## 7. Tests and quality

- **Test coverage: 0%.** There are no tests, fixtures or CI.
- No formatter, linter or type hints. Style is mixed: many `a; b; c` one-liners and single-letter
  names.
- No logging; errors are either swallowed or shown as raw exception text.

## 8. Open source hygiene

| Item | Present? |
| :-- | :-- |
| LICENSE | ❌ No license, which means "all rights reserved" by default, so nobody can legally reuse it. |
| README | ⚠️ Present but thin. One bold marker isn't closed, and it references `vamusic_ERDiagram.jpg`, which isn't in the repo (`*.jpg` is gitignored). |
| CONTRIBUTING / CODE_OF_CONDUCT / SECURITY | ❌ |
| Issue / PR templates | ❌ |
| CI (GitHub Actions) | ❌ |
| Dependency manifest / lockfile | ❌ |
| Releases / tags / topics / homepage | ❌ None set on the GitHub repo. |
| Screenshots / demo | ❌ |
| Default branch name | `master` (fine; renaming is optional). |

## 9. Summary

The schema shows real database design work. The applications around it don't currently work:
the listener app doesn't start, no seeded account can log in, and the admin importer silently
breaks the database. Even after those are fixed, the app and the database disagree about which
tables hold likes and follows, so the triggers and analytics the report highlights never fire from
real use.

The modernization should treat the **database as the product**: fix the correctness bugs above,
add tests that pin the behaviour of every trigger, procedure and view, and build a modern interface
whose job is to show that database work clearly.
