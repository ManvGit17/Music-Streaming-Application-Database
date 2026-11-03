"""The ``vamusic`` command line, end to end against a fresh database."""

from __future__ import annotations

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from vamusic import cli
from vamusic.config import get_settings


@pytest.fixture
def fresh_db(pg_url, monkeypatch):
    with psycopg.connect(pg_url, autocommit=True) as admin:
        admin.execute("DROP DATABASE IF EXISTS vamusic_cli")
        admin.execute("CREATE DATABASE vamusic_cli")
    url = make_conninfo(**{**conninfo_to_dict(pg_url), "dbname": "vamusic_cli"})
    monkeypatch.setenv("VAMUSIC_DATABASE_URL", url)
    get_settings.cache_clear()
    yield url
    get_settings.cache_clear()


def test_migrate_seed_refresh(fresh_db, capsys):
    assert cli.main(["migrate", "--app-password", "cli-test"]) == 0
    out = capsys.readouterr().out
    assert "applied 0001_extensions_and_roles" in out
    assert "set password for role vamusic_app" in out

    assert cli.main(["migrate"]) == 0
    assert "schema is up to date" in capsys.readouterr().out

    assert cli.main(["seed", "--scale", "tiny"]) == 0
    assert "listening_event" in capsys.readouterr().out

    # Seeding twice is refused, unless the caller says that's fine.
    assert cli.main(["seed", "--scale", "tiny"]) == 1
    assert cli.main(["seed", "--scale", "tiny", "--if-empty"]) == 0
    capsys.readouterr()

    assert cli.main(["refresh"]) == 0
    assert "trending_track" in capsys.readouterr().out

    with psycopg.connect(fresh_db) as conn:
        assert conn.execute("SELECT count(*) FROM vamusic.track").fetchone()[0] > 100


def test_unknown_command_exits():
    with pytest.raises(SystemExit):
        cli.main(["dance"])
