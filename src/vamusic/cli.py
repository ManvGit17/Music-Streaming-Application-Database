"""``vamusic`` command line: migrate, seed, refresh, inspect partitions, serve, export the API."""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import date, timedelta

import psycopg

from vamusic.config import get_settings
from vamusic.db.migrations import migrate, set_app_password


def _connect() -> psycopg.Connection:
    return psycopg.connect(get_settings().database_url)


def cmd_migrate(args: argparse.Namespace) -> int:
    with _connect() as conn:
        applied = migrate(conn)
        for m in applied:
            print(f"applied {m.version:04d}_{m.name}")
        if not applied:
            print("schema is up to date")
        # Keep monthly partitions a year ahead of today.
        today = date.today()
        made = conn.execute(
            "SELECT vamusic.ensure_listening_partitions(%s, %s)",
            (today.replace(day=1), today + timedelta(days=366)),
        ).fetchone()
        conn.commit()
        if made and made[0]:
            print(f"created {made[0]} listening_event partitions")
        password = args.app_password or os.environ.get("VAMUSIC_APP_PASSWORD")
        if password:
            set_app_password(conn, password)
            print("set password for role vamusic_app")
    return 0


def cmd_seed(args: argparse.Namespace) -> int:
    from vamusic.seed.generator import generate
    from vamusic.seed.loader import AlreadySeeded, load

    started = time.perf_counter()
    dataset = generate(args.scale, args.seed)
    print(f"generated {args.scale} dataset in {time.perf_counter() - started:.1f}s")
    with _connect() as conn:
        try:
            report = load(conn, dataset)
        except AlreadySeeded as exc:
            print(exc)
            return 0 if args.if_empty else 1
    for table, rows in report.rows.items():
        print(f"  {table:<18} {rows:>9,} rows  {report.seconds[table]:>6.2f}s")
    print(f"  {'refresh_analytics':<18} {'':>14}  {report.seconds['refresh_analytics']:>6.2f}s")
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    from pathlib import Path

    from vamusic.seed.generator import generate
    from vamusic.seed.loader import export

    out = Path(args.out)
    manifest = export(generate(args.scale, args.seed), out)
    tables = manifest["tables"]
    assert isinstance(tables, list)
    size = sum(f.stat().st_size for f in out.glob("*.tsv.gz"))
    print(f"wrote {len(tables)} tables to {out} ({size / 1e6:.1f} MB gzipped)")
    return 0


def cmd_refresh(_args: argparse.Namespace) -> int:
    with _connect() as conn:
        for view, ms in conn.execute("SELECT * FROM vamusic.refresh_analytics()").fetchall():
            print(f"{view:<26} {ms:>8} ms")
        conn.commit()
    return 0


def cmd_partitions(_args: argparse.Namespace) -> int:
    from vamusic.db import queries

    with _connect() as conn:
        rows = conn.execute(queries.get("admin.partitions").psycopg).fetchall()
    if not rows:
        print("no listening_event partition holds rows yet")
        return 0
    print(f"{'partition':<32} {'rows (estimate)':>16} {'size':>10}  bounds")
    for name, bounds, estimated_rows, size in rows:
        print(f"{name:<32} {estimated_rows:>16,} {size / 1024**2:>8.1f} MB  {bounds}")
    total = sum(r[2] for r in rows)
    print(f"{len(rows)} partitions, about {total:,} rows")
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run(
        "vamusic.api.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
    return 0


def openapi_json() -> str:
    """The API's OpenAPI document, formatted stably so the committed copy diffs cleanly."""
    import json

    from vamusic.api.app import create_app

    document = create_app().openapi()
    # The reference's request examples target the Compose stack.
    document["servers"] = [{"url": "http://localhost:8000", "description": "docker compose up"}]
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def cmd_openapi(args: argparse.Namespace) -> int:
    from pathlib import Path

    Path(args.out).write_text(openapi_json(), encoding="utf-8", newline="\n")
    print(f"wrote {args.out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="vamusic", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("migrate", help="apply pending database migrations")
    p.add_argument("--app-password", help="set the vamusic_app login password")
    p.set_defaults(func=cmd_migrate)

    p = sub.add_parser("seed", help="load deterministic demo data into an empty database")
    p.add_argument("--scale", choices=["tiny", "web", "demo", "full"], default="demo")
    p.add_argument("--seed", type=int, default=17)
    p.add_argument("--if-empty", action="store_true", help="succeed quietly if already seeded")
    p.set_defaults(func=cmd_seed)

    p = sub.add_parser("export", help="write the dataset as gzipped COPY files for the web demo")
    p.add_argument("--scale", choices=["tiny", "web", "demo", "full"], default="web")
    p.add_argument("--seed", type=int, default=17)
    p.add_argument("--out", default="web/public/seed")
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("refresh", help="refresh the analytics materialized views")
    p.set_defaults(func=cmd_refresh)

    p = sub.add_parser("partitions", help="list listening_event partitions with rows and size")
    p.set_defaults(func=cmd_partitions)

    p = sub.add_parser("serve", help="run the HTTP API")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--reload", action="store_true")
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("openapi", help="write the API's OpenAPI document for the docs site")
    p.add_argument("--out", default="site/openapi.json")
    p.set_defaults(func=cmd_openapi)

    args = parser.parse_args(argv)
    result: int = args.func(args)
    return result


if __name__ == "__main__":
    sys.exit(main())
