"""Health and schema introspection (the data behind the UI's Schema Atlas)."""

from __future__ import annotations

from fastapi import APIRouter

from vamusic import __version__
from vamusic.api.deps import DbSession, Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api", tags=["meta"], route_class=LensRoute)


@router.get("/health")
def health(db: DbSession) -> Row:
    row = db.q1("meta.health")
    assert row is not None
    return {"status": "ok", "version": __version__, **row}


@router.get("/schema")
def schema(db: DbSession) -> Row:
    """Tables, columns, keys and policies, read live from the system catalogs."""
    return {"tables": db.q("meta.tables"), "foreign_keys": db.q("meta.foreign_keys")}
