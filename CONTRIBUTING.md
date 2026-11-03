# Contributing to VaMusic

Thanks for helping. VaMusic is a database-first project, so changes to SQL are as welcome as
changes to Python, and they get the same review.

## Set up

You need [uv](https://docs.astral.sh/uv/), Docker, and Git.

```bash
git clone https://github.com/ManvGit17/Music-Streaming-Application-Database.git
cd Music-Streaming-Application-Database
uv sync
uv run pre-commit install
```

Run everything locally with `docker compose up`, or point the CLI at your own PostgreSQL 18
(with pgvector) through `VAMUSIC_DATABASE_URL`:

```bash
uv run vamusic migrate --app-password dev-app-password
uv run vamusic seed --scale tiny
uv run vamusic serve --reload
```

## Tests

The tests start their own PostgreSQL 18 and MySQL 8.4 containers, so Docker must be running.

```bash
uv run pytest -m "not legacy"   # PostgreSQL schema, API and generator (about 30 s)
uv run pytest -m legacy         # the original MySQL v1 project (about 45 s)
uv run ruff check src tests && uv run mypy
```

## Changing the database

- **Never edit a migration that has been merged.** The runner records a checksum and refuses to
  continue if an applied file changes. Add a new numbered file in `db/migrations/` instead.
- Every function gets a pinned `search_path`; migration 0007 enforces this for the `vamusic`
  schema, so new functions in later migrations should declare `SET search_path` themselves.
- New tables that hold per-listener data need row-level security policies, and a test in
  `tests/db/test_security.py` that tries to read and write another listener's rows.
- If a change affects query plans, include the before/after `EXPLAIN (ANALYZE, BUFFERS)` in the
  pull request. The API's `?lens=plan` parameter is a quick way to capture one.

## Commits and pull requests

- Keep commits small and focused, with messages in the
  [Conventional Commits](https://www.conventionalcommits.org/) style: `feat(db): ...`,
  `fix(api): ...`, `docs: ...`, `test: ...`.
- Open pull requests against `master`. CI must be green: lint, types, both test suites, the
  Compose smoke test and the dependency audit.
- `legacy/` is the original 2025 course project. Fix bugs there only if they stop it running, and
  add a characterization test in `tests/legacy` when you do.

## Reporting bugs and ideas

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
