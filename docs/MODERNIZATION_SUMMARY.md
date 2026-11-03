# Modernization summary

How VaMusic went from a 2025 course project to version 2.0.0, what changed, and what's left.
Written on 2026-11-03.

## Before and after

| | Before (v1, 2025) | After (v2.0.0) |
| :-- | :-- | :-- |
| Database | MySQL 8, one 1,096-line script | PostgreSQL 18, ten numbered migrations with checksums |
| Application | Two Tkinter desktop apps, inline SQL | FastAPI API and a React web app sharing named SQL files |
| Runs | Only with a local MySQL and Python setup | In the browser with no install, or `docker compose up` |
| Did it work? | Listener app didn't start; no user could log in | Both clients work end to end; tested in CI |
| Data | A few hand-written rows | Deterministic generator, 6,000 to 1,000,000 plays |
| Counters | Row triggers re-scanning history per insert | Statement-level triggers: 73× faster for a 10k insert at 1M rows |
| Search | `LIKE '%term%'` | Full text and trigrams fused with Reciprocal Rank Fusion |
| Recommendations | Top genres | pgvector HNSW over audio-feature vectors |
| Security | Hard-coded DB password, no admin sign-in | Roles, row-level security, definer functions, audit log |
| Tests | None | 173 Python tests on real databases, Playwright and axe-core |
| CI | None | Lint, types, tests, legacy, Compose smoke test, web, docs, audit, CodeQL |
| Docs | A course report | README, docs site with API reference, design notes, contributing guides |
| License | None | MIT |

## How it was done

The work landed as phased pull requests, each reviewed and merged only with CI green.

1. **Audit and plan.** [docs/audit.md](audit.md) recorded 15 application and 11 database
   findings against the original commit, with severity and evidence. [docs/research.md](research.md)
   compared similar projects and tools, and [docs/roadmap.md](roadmap.md) set the plan.
2. **Characterization tests first.** Before changing anything, tests pinned how the original
   MySQL schema behaved, so the fixes in `legacy/` could be shown to change only what they
   meant to.
3. **Stage 1: the database core**
   ([#1](https://github.com/ManvGit17/Music-Streaming-Application-Database/pull/1)).
   The PostgreSQL 18 schema, the API, the data generator, the CLI, tests and CI.
4. **Stage 2: the web app**
   ([#2](https://github.com/ManvGit17/Music-Streaming-Application-Database/pull/2),
   [#4](https://github.com/ManvGit17/Music-Streaming-Application-Database/pull/4)).
   The React app, the SQL Lens and Schema Atlas, PGlite in the browser, and GitHub Pages.
5. **Stage 3: presence and documentation.** License, branding, screenshots, the README, the
   docs site, the changelog, contribution material and launch drafts.

## Decisions worth knowing about

| Decision | Why |
| :-- | :-- |
| PostgreSQL instead of MySQL | Row-level security, transition tables, exclusion constraints, transactional DDL, pgvector and pg_trgm are central to the design and not available in MySQL in the same form. |
| Logic in the database | Every client goes through it, so privacy and counters stay right even if a route has a bug. |
| One set of SQL files | The API and the browser can't drift apart, and a test enforces it. |
| PGlite for the demo | Reviewers can try the real database with no install and no server cost. |
| Anchoring time windows to the data | Demo rankings stay meaningful instead of going blank a week later. |
| Keeping v1 in `legacy/` | Every before-and-after claim can be checked. |
| MIT license | Simple and permissive; agreed with the original co-author. |
| Astro Starlight for docs | Static, fast, searchable, and generates the API reference from the OpenAPI schema. |

## Verified numbers

- Counter benchmark: `scripts/bench_counters.py`, results in [docs/database.md](database.md).
- Test counts: `uv run pytest --collect-only -q` and `web/e2e/`.
- Accessibility: no serious axe-core violations on the tested pages.

## Known limitations

- A very popular track's counter row is a contention point under heavy concurrent writes.
- The in-browser database serves one tab at a time and is rebuilt per browser.
- The API hasn't been load-tested beyond the counter benchmark.
- The music is synthesized from audio features; there is no real catalog.

## Left for the repository owner

These need an account owner's action and weren't done automatically:

- Upload `docs/assets/social-preview.png` in **Settings → General → Social preview**.
- Turn on **private vulnerability reporting** under **Settings → Security**, which
  [SECURITY.md](../SECURITY.md) refers to.
- Decide whether to tag `v2.0.0` and publish a GitHub release from the changelog.
- Review the open Dependabot pull requests.
- Open GitHub issues from [docs/good-first-issues.md](good-first-issues.md) and label them
  `good first issue`.
- Post the drafts in [docs/launch/](launch/) when ready.
