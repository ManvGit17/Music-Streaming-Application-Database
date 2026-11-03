## What and why

<!-- What does this change, and what problem does it solve? Link any issue it closes. -->

## How it was tested

<!-- Tests added or updated, and anything you checked by hand. -->

## Checklist

- [ ] `uv run pytest` passes (both suites, if `legacy/` changed)
- [ ] `uv run ruff check src tests` and `uv run mypy` pass
- [ ] Database changes are a **new** migration file; merged migrations are untouched
- [ ] New per-listener tables have row-level security and a test in `tests/db/test_security.py`
- [ ] Query-plan changes include before/after `EXPLAIN (ANALYZE, BUFFERS)` output
- [ ] Docs updated where behaviour changed
