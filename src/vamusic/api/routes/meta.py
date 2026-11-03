"""Health and schema introspection (the data behind the UI's Schema Atlas)."""

from __future__ import annotations

from fastapi import APIRouter

from vamusic import __version__
from vamusic.api.deps import DbSession
from vamusic.api.queries import Row
from vamusic.api.routing import LensRoute

router = APIRouter(prefix="/api", tags=["meta"], route_class=LensRoute)


@router.get("/health")
def health(db: DbSession) -> Row:
    row = db.one("SELECT current_setting('server_version') AS postgres, current_user AS role")
    assert row is not None
    return {"status": "ok", "version": __version__, **row}


@router.get("/schema")
def schema(db: DbSession) -> Row:
    """Tables, columns, keys and policies, read live from the system catalogs."""
    tables = db.all("""
        SELECT c.relname AS name,
               CASE c.relkind WHEN 'p' THEN 'partitioned' WHEN 'm' THEN 'materialized view'
                              WHEN 'v' THEN 'view' ELSE 'table' END AS kind,
               obj_description(c.oid, 'pg_class') AS comment,
               c.relrowsecurity AS rls,
               greatest(c.reltuples, 0)::bigint AS estimated_rows,
               (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'name', a.attname,
                    'type', format_type(a.atttypid, a.atttypmod),
                    'nullable', NOT a.attnotnull,
                    'generated', CASE a.attgenerated WHEN 's' THEN 'stored'
                                                     WHEN 'v' THEN 'virtual' END,
                    'identity', a.attidentity <> '') ORDER BY a.attnum), '[]')
                FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
               (SELECT coalesce(jsonb_agg(p.polname ORDER BY p.polname), '[]')
                FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'vamusic' AND c.relkind IN ('r', 'p', 'm', 'v')
          AND NOT c.relispartition
        ORDER BY c.relname
    """)
    foreign_keys = db.all("""
        SELECT con.conname AS name,
               src.relname AS from_table,
               (SELECT jsonb_agg(a.attname) FROM unnest(con.conkey) k
                JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k) AS from_columns,
               dst.relname AS to_table,
               con.confdeltype AS on_delete
        FROM pg_constraint con
        JOIN pg_class src ON src.oid = con.conrelid
        JOIN pg_class dst ON dst.oid = con.confrelid
        JOIN pg_namespace n ON n.oid = src.relnamespace
        WHERE con.contype = 'f' AND n.nspname = 'vamusic' AND NOT src.relispartition
        ORDER BY src.relname, con.conname
    """)
    return {"tables": tables, "foreign_keys": foreign_keys}
