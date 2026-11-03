"""The legacy Tkinter apps must at least compile; the listener app shipped with a syntax error."""

from __future__ import annotations

import py_compile

import pytest

from tests.legacy.conftest import LEGACY_APP


@pytest.mark.parametrize("path", sorted(LEGACY_APP.glob("*.py")), ids=lambda p: p.name)
def test_legacy_module_compiles(path, tmp_path):
    py_compile.compile(str(path), cfile=str(tmp_path / "out.pyc"), doraise=True)
