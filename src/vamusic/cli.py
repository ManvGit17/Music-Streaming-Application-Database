"""``vamusic`` command line: migrate, seed, refresh and serve."""

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


def cmd_refresh(_args: argparse.Namespace) -> int:
    with _connect() as conn:
        for view, ms in conn.execute("SELECT * FROM vamusic.refresh_analytics()").fetchall():
            print(f"{view:<26} {ms:>8} ms")
        conn.commit()
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="vamusic", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("migrate", help="apply pending database migrations")
    p.add_argument("--app-password", help="set the vamusic_app login password")
    p.set_defaults(func=cmd_migrate)

    p = sub.add_parser("seed", help="load deterministic demo data into an empty database")
    p.add_argument("--scale", choices=["tiny", "demo", "full"], default="demo")
    p.add_argument("--seed", type=int, default=17)
    p.add_argument("--if-empty", action="store_true", help="succeed quietly if already seeded")
    p.set_defaults(func=cmd_seed)

    p = sub.add_parser("refresh", help="refresh the analytics materialized views")
    p.set_defaults(func=cmd_refresh)

    p = sub.add_parser("serve", help="run the HTTP API")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--reload", action="store_true")
    p.set_defaults(func=cmd_serve)

    args = parser.parse_args(argv)
    result: int = args.func(args)
    return result


if __name__ == "__main__":
    sys.exit(main())
