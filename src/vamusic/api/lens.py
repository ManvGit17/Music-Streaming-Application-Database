"""SQL Lens: a per-request trace of every statement the API ran.

Clients opt in with ``?lens=1`` (statements and timings) or ``?lens=plan`` (also the
``EXPLAIN (ANALYZE, BUFFERS)`` plan and the triggers that fired). The plan is captured inside a
savepoint that is rolled back, so a traced write still happens exactly once.
"""

from __future__ import annotations

import re
import textwrap
import time
from dataclasses import dataclass, field
from typing import Any, Literal

import psycopg
from psycopg.rows import dict_row

LensMode = Literal["off", "trace", "plan"]

_EXPLAINABLE = re.compile(r"^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b", re.IGNORECASE)


@dataclass
class Statement:
    sql: str
    params: list[Any]
    ms: float
    rows: int
    plan: Any = None
    triggers: list[dict[str, Any]] = field(default_factory=list)
    planning_ms: float | None = None
    execution_ms: float | None = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "sql": self.sql,
            "params": [str(p) for p in self.params],
            "ms": self.ms,
            "rows": self.rows,
        }
        if self.plan is not None:
            out |= {
                "plan": self.plan,
                "triggers": self.triggers,
                "planning_ms": self.planning_ms,
                "execution_ms": self.execution_ms,
            }
        return out


@dataclass
class Trace:
    mode: LensMode
    role: str = ""
    user_id: int | None = None
    statements: list[Statement] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "user_id": self.user_id,
            "total_ms": round(sum(s.ms for s in self.statements), 3),
            "statements": [s.as_dict() for s in self.statements],
        }


def clean(sql: str) -> str:
    return textwrap.dedent(sql).strip()


def explain(
    conn: psycopg.Connection[Any], sql: str, params: Any
) -> tuple[Any, list[dict[str, Any]], float, float]:
    """Run EXPLAIN ANALYZE in a savepoint that is always rolled back."""
    row: dict[str, Any] | None = None
    with conn.transaction():
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}".encode(), params)
            row = cur.fetchone()
        raise psycopg.Rollback()  # undo whatever the analysed statement changed
    assert row is not None
    doc = row["QUERY PLAN"][0]
    triggers = [
        {
            "name": t.get("Trigger Name"),
            "relation": t.get("Relation"),
            "constraint": t.get("Constraint Name"),
            "calls": t.get("Calls"),
            "ms": t.get("Time"),
        }
        for t in doc.get("Triggers", [])
    ]
    return doc["Plan"], triggers, doc.get("Planning Time", 0.0), doc.get("Execution Time", 0.0)


def run(
    conn: psycopg.Connection[Any], trace: Trace | None, sql: str, params: Any = None
) -> list[dict[str, Any]]:
    """Execute ``sql`` and, if tracing, record it."""
    text = clean(sql)
    plan = None
    triggers: list[dict[str, Any]] = []
    planning = execution = None
    if trace and trace.mode == "plan" and _EXPLAINABLE.match(text):
        plan, triggers, planning, execution = explain(conn, text, params)

    started = time.perf_counter()
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(text.encode(), params)
        rows = cur.fetchall() if cur.description else []
        count = cur.rowcount
    elapsed = round((time.perf_counter() - started) * 1000, 3)

    if trace:
        values = list(params.values()) if isinstance(params, dict) else list(params or [])
        trace.statements.append(
            Statement(text, values, elapsed, count, plan, triggers, planning, execution)
        )
    return rows
