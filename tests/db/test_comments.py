"""Every function in the schema has a COMMENT ON, so the catalog explains itself."""

from __future__ import annotations


def test_every_function_has_a_comment(db):
    missing = db.rows(
        """SELECT p.oid::regprocedure::text AS function
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
           WHERE n.nspname IN ('vamusic', 'audit')
             AND d.objid IS NULL
             AND obj_description(p.oid, 'pg_proc') IS NULL
           ORDER BY 1"""
    )
    names = [r["function"] for r in missing]
    assert names == [], "add COMMENT ON FUNCTION for:\n" + "\n".join(names)
