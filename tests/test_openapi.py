"""The docs site's API reference is built from site/openapi.json, so it must match the code."""

from __future__ import annotations

from pathlib import Path

from vamusic.cli import openapi_json

COMMITTED = Path(__file__).resolve().parent.parent / "site" / "openapi.json"


def test_committed_openapi_document_is_current():
    assert COMMITTED.read_text(encoding="utf-8") == openapi_json(), (
        "site/openapi.json is out of date; run `uv run vamusic openapi`"
    )


def test_every_operation_is_described():
    import json

    document = json.loads(openapi_json())
    missing = [
        f"{method.upper()} {path}"
        for path, operations in document["paths"].items()
        for method, operation in operations.items()
        if not operation.get("description")
    ]
    assert not missing, f"add a docstring to: {', '.join(missing)}"
