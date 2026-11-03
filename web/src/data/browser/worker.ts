/// <reference lib="webworker" />
/**
 * Runs PostgreSQL 18 (PGlite, WebAssembly) off the main thread.
 *
 * On first visit it applies the repository's real migrations and loads the exported seed with
 * COPY, reporting each step. The database is kept in IndexedDB under a name derived from the
 * migrations and seed, so a later deploy with schema changes starts a fresh database.
 */

import { PGlite, types } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import type { BootInfo, BootProgress, Request, Response } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const migrations = Object.entries(
  import.meta.glob<string>("@db/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)
  .map(([path, sql]) => ({ file: path.split("/").pop()!, sql }))
  .sort((a, b) => a.file.localeCompare(b.file));

interface Manifest {
  tables: { table: string; columns: string[]; file: string; rows: number }[];
  identity: { table: string; column: string }[];
  audited: string[];
}

let db: PGlite | null = null;

function post(message: Response) {
  self.postMessage(message);
}

/** FNV-1a, enough to tell one build's schema and data from another's. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Match the API's JSON: timestamps as ISO strings, dates as YYYY-MM-DD, numerics as numbers.
const parsers = {
  [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
  [types.TIMESTAMP]: (v: string) => new Date(`${v}Z`).toISOString(),
  [types.DATE]: (v: string) => v,
  [types.NUMERIC]: (v: string) => Number(v),
};

async function open(dataDir: string): Promise<PGlite> {
  return PGlite.create({
    dataDir,
    extensions: { vector, pg_trgm, unaccent, btree_gist, pgcrypto },
    parsers,
  });
}

async function removeStaleDatabases(keep: string) {
  try {
    const all = await indexedDB.databases();
    for (const { name } of all) {
      if (name?.startsWith("/pglite/vamusic-") && name !== `/pglite/${keep}`) {
        indexedDB.deleteDatabase(name);
      }
    }
  } catch {
    // indexedDB.databases() isn't available everywhere; stale copies are only wasted space.
  }
}

/**
 * The seed files are gzipped. Some servers (Vite's dev server among them) send them with
 * Content-Encoding: gzip, so the browser has already decompressed them; others send the raw
 * archive. Check the gzip magic bytes rather than trusting headers.
 */
async function seedBlob(response: globalThis.Response): Promise<Blob> {
  if (!response.ok) throw new Error(`couldn't load ${response.url} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new Blob([bytes]);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new globalThis.Response(stream).blob();
}

async function boot(id: number, base: string): Promise<BootInfo> {
  const started = performance.now();
  const progress = (p: BootProgress) => post({ id, type: "progress", progress: p });

  const manifestText = await fetch(`${base}seed/manifest.json`).then((r) => {
    if (!r.ok) throw new Error("The demo dataset is missing. Run `npm run seed` in web/.");
    return r.text();
  });
  const manifest = JSON.parse(manifestText) as Manifest;
  const name = `vamusic-${hash(migrations.map((m) => m.sql).join("\n") + manifestText)}`;

  progress({ step: "open", label: "Starting PostgreSQL 18 in WebAssembly", fraction: 0.02 });
  let persisted = true;
  try {
    db = await open(`idb://${name}`);
  } catch {
    persisted = false;
    db = await open("memory://");
  }
  void removeStaleDatabases(name);

  const state = await db.query<{ ready: boolean; partial: boolean }>(
    `SELECT to_regclass('vamusic_meta.demo') IS NOT NULL AS ready,
            to_regnamespace('vamusic') IS NOT NULL AS partial`,
  );
  if (state.rows[0]?.ready) {
    progress({ step: "ready", label: "Ready", fraction: 1 });
    return { postgres: await version(), fresh: false, persisted, seconds: 0 };
  }
  if (state.rows[0]?.partial) {
    // Left over from a build that never committed its marker. Drop it inside PostgreSQL rather
    // than deleting the IndexedDB database, which another tab's connection could block.
    progress({ step: "open", label: "Clearing an unfinished setup", fraction: 0.03 });
    await db.exec("DROP SCHEMA IF EXISTS vamusic, audit, vamusic_meta CASCADE");
  }

  // The whole build is one transaction (PostgreSQL DDL is transactional), so a visit that ends
  // part-way through leaves nothing behind and the next one simply starts again.
  await db.exec("BEGIN");
  try {
    await db.exec(`
      CREATE SCHEMA vamusic_meta;
      CREATE TABLE vamusic_meta.migration (
        version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz DEFAULT now());
    `);
    for (const [i, m] of migrations.entries()) {
      progress({
        step: "migrate",
        label: `Applying ${m.file.replace(/\.sql$/, "")}`,
        fraction: 0.05 + (0.25 * i) / migrations.length,
      });
      await db.exec(m.sql);
      await db.query("INSERT INTO vamusic_meta.migration (version, name) VALUES ($1, $2)", [
        Number.parseInt(m.file, 10),
        m.file,
      ]);
    }
    // Browser-only: lets demo sign-in verify bcrypt hashes in SQL. The migrations leave
    // search_path at "vamusic, public" and revoke PUBLIC's EXECUTE on new functions, so the
    // schema is named and the two functions sign-in needs are granted explicitly.
    await db.exec(`
      RESET search_path;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
      GRANT EXECUTE ON FUNCTION public.crypt(text, text), public.gen_salt(text, integer)
        TO vamusic_app;
    `);

    const totalRows = manifest.tables.reduce((n, t) => n + t.rows, 0);
    let loaded = 0;
    for (const t of manifest.audited)
      await db.exec(`ALTER TABLE vamusic.${t} DISABLE TRIGGER audit`);
    for (const t of manifest.tables) {
      progress({
        step: "seed",
        label: `Loading ${t.rows.toLocaleString("en")} rows into ${t.table}`,
        fraction: 0.3 + (0.5 * loaded) / totalRows,
      });
      const blob = await seedBlob(await fetch(`${base}seed/${t.file}`));
      await db.query(`COPY vamusic.${t.table} (${t.columns.join(", ")}) FROM '/dev/blob'`, [], {
        blob,
      });
      loaded += t.rows;
    }
    for (const t of manifest.audited)
      await db.exec(`ALTER TABLE vamusic.${t} ENABLE TRIGGER audit`);
    for (const { table, column } of manifest.identity) {
      await db.query(
        `SELECT setval(pg_get_serial_sequence('vamusic.${table}', '${column}'),
                       coalesce((SELECT max(${column}) FROM vamusic.${table}), 0) + 1, false)`,
      );
    }

    progress({ step: "finish", label: "Refreshing trending, rollups and search", fraction: 0.82 });
    await db.query(
      "SELECT vamusic.ensure_listening_partitions(date_trunc('month', now())::date, (now() + interval '1 year')::date)",
    );
    await db.query("SELECT * FROM vamusic.refresh_analytics()");
    // The BRIN index predates the COPY, so the loaded block ranges have no summaries yet.
    await db.query("SELECT vamusic.summarize_listening_events()");
    progress({ step: "finish", label: "Collecting planner statistics", fraction: 0.95 });
    await db.exec("ANALYZE");
    await db.exec(
      "CREATE TABLE vamusic_meta.demo (built_at timestamptz DEFAULT now()); INSERT INTO vamusic_meta.demo DEFAULT VALUES;",
    );
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK").catch(() => undefined);
    throw err;
  }

  progress({ step: "ready", label: "Ready", fraction: 1 });
  return {
    postgres: await version(),
    fresh: true,
    persisted,
    seconds: (performance.now() - started) / 1000,
  };
}

async function version(): Promise<string> {
  const r = await db!.query<{ v: string }>("SELECT current_setting('server_version') AS v");
  return r.rows[0]?.v ?? "18";
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "boot":
        post({ id: msg.id, type: "ok", result: await boot(msg.id, msg.base) });
        return;
      case "query": {
        const r = await db!.query(msg.sql, msg.params);
        post({
          id: msg.id,
          type: "ok",
          result: { rows: r.rows, affectedRows: r.affectedRows ?? 0 },
        });
        return;
      }
      case "exec":
        await db!.exec(msg.sql);
        post({ id: msg.id, type: "ok", result: null });
        return;
      case "reset": {
        const dir = db?.dataDir;
        await db?.close();
        db = null;
        if (dir?.startsWith("idb://")) indexedDB.deleteDatabase(`/pglite/${dir.slice(6)}`);
        post({ id: msg.id, type: "ok", result: null });
        return;
      }
    }
  } catch (err) {
    const e = err as { message?: string; code?: string; stack?: string };
    post({
      id: msg.id,
      type: "error",
      message: e.message ?? String(err),
      code: e.code,
      stack: e.stack,
    });
  }
};
