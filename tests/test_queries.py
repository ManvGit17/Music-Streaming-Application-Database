"""The shared SQL query files and their placeholder conversion (no database needed)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from vamusic.db import queries
from vamusic.db.queries import QueryError, parse

ROUTES = Path(__file__).resolve().parents[1] / "src" / "vamusic" / "api" / "routes"


def test_placeholders_become_psycopg_params():
    (q,) = parse("-- name: x\nSELECT :a, :b::text, :a FROM t WHERE c LIKE '5%'", "ns").values()
    assert q.name == "ns.x"
    assert q.params == ("a", "b")
    assert q.psycopg == "SELECT %(a)s, %(b)s::text, %(a)s FROM t WHERE c LIKE '5%%'"


def test_casts_and_comments_are_not_parameters():
    text = "-- name: x\n-- Note: not a :param\nSELECT 'x'::regclass, CAST(:id AS uuid)"
    (q,) = parse(text, "ns").values()
    assert q.params == ("id",)
    assert "-- Note: not a :param" in q.psycopg


def test_duplicate_and_empty_queries_are_rejected():
    with pytest.raises(QueryError, match="duplicate"):
        parse("-- name: a\nSELECT 1;\n-- name: a\nSELECT 2;", "ns")
    with pytest.raises(QueryError, match="empty"):
        parse("-- name: a\n\n-- name: b\nSELECT 1;", "ns")


def test_unknown_query():
    with pytest.raises(QueryError, match="unknown query"):
        queries.get("nope.nothing")


def test_every_query_used_by_the_api_exists():
    used = set()
    for path in ROUTES.glob("*.py"):
        used |= set(re.findall(r'"([a-z]+\.[a-z_]+)"', path.read_text(encoding="utf-8")))
    known = set(queries.load())
    assert used <= known, used - known


def test_every_query_is_used_by_the_api():
    """Unused queries would rot; the web demo uses the same set."""
    text = "".join(p.read_text(encoding="utf-8") for p in ROUTES.glob("*.py"))
    unused = [name for name in queries.load() if f'"{name}"' not in text]
    assert unused == []
