"""The admin app's Import SQL button must load the project schema completely or report why not."""

from __future__ import annotations

import pytest
from conftest import SCHEMA, Db

pytest.importorskip("tkinter")

pytestmark = pytest.mark.legacy


@pytest.fixture
def admin(mysql_server, monkeypatch):
    import db_utils
    import vamusic_admin_ui

    for key in ("host", "port", "user", "password"):
        monkeypatch.setitem(db_utils.DB_CONFIG, key, mysql_server[key])
    return vamusic_admin_ui


def test_import_loads_every_routine(admin, mysql_server):
    assert admin.run_sql_file(str(SCHEMA)) > 100
    db = Db(mysql_server)
    try:
        assert db.value(
            "SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='vamusic'"
        ) == 9
        assert db.value(
            "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='vamusic'"
        ) == 8
    finally:
        db.close()


def test_import_reports_failures(admin, tmp_path):
    bad = tmp_path / "bad.sql"
    bad.write_text("SELECT 1;\nTHIS IS NOT SQL;\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="1 of 2 statements failed"):
        admin.run_sql_file(str(bad))


def test_default_schema_path_exists(admin):
    from pathlib import Path

    assert Path(admin.SQL_FILE_PATH).resolve() == SCHEMA
