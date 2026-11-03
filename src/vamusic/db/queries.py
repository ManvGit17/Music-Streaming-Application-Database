"""Named SQL queries shared by the API and the in-browser demo.

Queries live in ``db/queries/*.sql``, each introduced by a ``-- name: <name>`` line and using
``:param`` placeholders. The API reads them as ``<file>.<name>`` (for example
``catalog.search``); the web app's PGlite mode loads the very same files, so the demo runs the
same SQL as the server.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

QUERIES_DIR = Path(__file__).resolve().parents[3] / "db" / "queries"

_HEADER = re.compile(r"^--\s*name:\s*([a-z_][a-z0-9_]*)\s*$")
# A placeholder is ":name", but not the second colon of a "::type" cast.
_PARAM = re.compile(r"(?<![:\w]):([a-z_][a-z0-9_]*)")


class QueryError(LookupError):
    pass


@dataclass(frozen=True)
class Query:
    name: str
    source: str
    params: tuple[str, ...]

    @property
    def psycopg(self) -> str:
        """The query with %(name)s placeholders (and literal % doubled) for psycopg."""
        lines = []
        for line in self.source.splitlines():
            if line.lstrip().startswith("--"):
                lines.append(line)
                continue
            lines.append(_PARAM.sub(r"%(\1)s", line.replace("%", "%%")))
        return "\n".join(lines)


def parse(text: str, namespace: str) -> dict[str, Query]:
    found: dict[str, Query] = {}
    name: str | None = None
    body: list[str] = []

    def flush() -> None:
        if name is None:
            return
        source = "\n".join(body).strip()
        if not source:
            raise QueryError(f"{namespace}.{name} is empty")
        code = "\n".join(ln for ln in source.splitlines() if not ln.lstrip().startswith("--"))
        params = tuple(dict.fromkeys(_PARAM.findall(code)))
        found[f"{namespace}.{name}"] = Query(f"{namespace}.{name}", source, params)

    for line in text.splitlines():
        header = _HEADER.match(line)
        if header:
            flush()
            name = header[1]
            if f"{namespace}.{name}" in found:
                raise QueryError(f"duplicate query {namespace}.{name}")
            body = []
        elif name is not None:
            body.append(line)
    flush()
    return found


@cache
def load(directory: Path = QUERIES_DIR) -> dict[str, Query]:
    queries: dict[str, Query] = {}
    for path in sorted(directory.glob("*.sql")):
        queries.update(parse(path.read_text(encoding="utf-8"), path.stem))
    return queries


def get(name: str) -> Query:
    try:
        return load()[name]
    except KeyError:
        raise QueryError(f"unknown query {name!r}") from None
