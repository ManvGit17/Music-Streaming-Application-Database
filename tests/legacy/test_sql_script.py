"""Unit tests for the DELIMITER-aware MySQL script splitter."""

from __future__ import annotations

from sql_script import split_mysql_script

from tests.legacy.conftest import SCHEMA


def test_plain_statements():
    assert split_mysql_script("SELECT 1; SELECT 2;") == ["SELECT 1", "SELECT 2"]


def test_delimiter_blocks_keep_bodies_intact():
    script = (
        "DELIMITER //\n"
        "CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END//\n"
        "DELIMITER ;\n"
        "SELECT 3;\n"
    )
    assert split_mysql_script(script) == [
        "CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END",
        "SELECT 3",
    ]


def test_semicolons_inside_strings_and_comments():
    script = "INSERT INTO t VALUES ('a;b', \"c;d\"); -- x; y\n/* z; */ SELECT `we;ird`;"
    assert split_mysql_script(script) == [
        "INSERT INTO t VALUES ('a;b', \"c;d\")",
        "SELECT `we;ird`",
    ]


def test_escaped_and_doubled_quotes():
    assert split_mysql_script(r"SELECT 'it\'s'; SELECT 'it''s';") == [
        r"SELECT 'it\'s'",
        "SELECT 'it''s'",
    ]


def test_project_schema_splits_into_whole_routines():
    statements = split_mysql_script(SCHEMA.read_text(encoding="utf-8"))
    routines = [
        s
        for s in statements
        if s.startswith(("CREATE TRIGGER", "CREATE PROCEDURE", "CREATE FUNCTION"))
    ]
    assert len(routines) == 17
    assert all(s.rstrip().endswith("END") for s in routines)
