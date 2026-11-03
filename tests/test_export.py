"""The web demo's seed export (no database needed)."""

from __future__ import annotations

import gzip
import json

import bcrypt

from vamusic.seed.generator import generate
from vamusic.seed.loader import DEMO_PASSWORD, _text_value, export


def test_text_format_escaping():
    assert _text_value(None) == r"\N"
    assert _text_value(True) == "t"
    assert _text_value("a\tb\nc\\d") == r"a\tb\nc\\d"


def test_export_matches_the_dataset(tmp_path):
    ds = generate("tiny")
    manifest = export(ds, tmp_path)
    on_disk = json.loads((tmp_path / "manifest.json").read_text())
    assert on_disk == manifest
    rows = {t["table"]: t["rows"] for t in manifest["tables"]}
    assert rows["listening_event"] == len(ds.events)
    assert rows["track"] == len(ds.tracks)
    lines = gzip.decompress((tmp_path / "track.tsv.gz").read_bytes()).decode().splitlines()
    assert len(lines) == len(ds.tracks)
    assert lines[0].split("\t")[2] == "Morning Light"


def test_export_is_reproducible(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    export(generate("tiny"), a)
    export(generate("tiny"), b)
    for f in a.iterdir():
        assert f.read_bytes() == (b / f.name).read_bytes(), f.name


def test_exported_accounts_use_the_demo_password(tmp_path):
    export(generate("tiny"), tmp_path)
    first = gzip.decompress((tmp_path / "user_account.tsv.gz").read_bytes()).decode()
    stored = first.splitlines()[0].split("\t")[-1]
    assert bcrypt.checkpw(DEMO_PASSWORD.encode(), stored.encode())
