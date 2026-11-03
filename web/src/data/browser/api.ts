/**
 * Browser mode: the whole backend, in the browser.
 *
 * Each method mirrors a FastAPI route and runs the same named queries from db/queries against
 * PostgreSQL 18 in a Web Worker. A "request" is one transaction that first switches to the
 * caller's database role and sets vamusic.user_id, so row-level security behaves exactly as it
 * does on the server.
 */

import { bind, query } from "@/lib/sql";
import { lens, type Principal, sessionStore } from "../store";
import {
  type Album,
  type Api,
  ApiError,
  type Artist,
  type ArtistRef,
  type AuditEntry,
  type Genre,
  type Health,
  type LensStatement,
  type LensTrace,
  type Me,
  type Overview,
  type PlanNode,
  type Play,
  type PlayIn,
  type Playlist,
  type PlaylistPatch,
  type PlaylistSummary,
  type SchemaInfo,
  type ScoredTrack,
  type SearchHit,
  type Session,
  type Track,
  type Wrapped,
} from "../types";
import type { BootInfo, BootProgress, QueryResult, Request, Response } from "./protocol";

type Row = Record<string, unknown>;
/**
 * A row as it comes back from PostgreSQL. It is untyped until the method returning it asserts
 * the API shape, which the shared queries guarantee (and the server's tests check).
 */
// biome-ignore lint/suspicious/noExplicitAny: the database/API type boundary
type DbRow = any;
type Outgoing = Request extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;

// PostgreSQL error codes that mean "the client asked for something it can't have".
const STATUS: Record<string, number> = {
  "23505": 409, // unique_violation
  "23P01": 409, // exclusion_violation
  "23503": 422, // foreign_key_violation
  "23514": 422, // check_violation
  "22023": 422, // invalid_parameter_value
  P0002: 404, // no_data_found
  "42501": 403, // insufficient_privilege, including row-level security
};

const EXPLAINABLE = /^(?:\s*--[^\n]*\n)*\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b/i;

class WorkerClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  private seq = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: unknown) => void;
      progress?: (p: BootProgress) => void;
    }
  >();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<Response>) => {
      const msg = event.data;
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      if (msg.type === "progress") {
        waiter.progress?.(msg.progress);
        return;
      }
      this.pending.delete(msg.id);
      if (msg.type === "ok") waiter.resolve(msg.result);
      else {
        const status = (msg.code && STATUS[msg.code]) || 500;
        if (status === 500) console.error("[vamusic worker]", msg.message, msg.stack ?? "");
        waiter.reject(Object.assign(new ApiError(status, msg.message), { code: msg.code }));
      }
    };
  }

  send<T>(req: Outgoing, progress?: (p: BootProgress) => void): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress });
      this.worker.postMessage({ ...req, id } as Request);
    });
  }
}

/** One request's transaction. Records into the SQL Lens when it's open. */
class Tx {
  private readonly client: WorkerClient;
  readonly trace: LensTrace | null;

  constructor(client: WorkerClient, trace: LensTrace | null) {
    this.client = client;
    this.trace = trace;
  }

  async raw(sql: string, params: unknown[] = [], name: string | null = null): Promise<DbRow[]> {
    let plan: PlanNode | undefined;
    let triggers: LensStatement["triggers"];
    let planning: number | undefined;
    let execution: number | undefined;
    if (this.trace && name && EXPLAINABLE.test(sql)) {
      // Same approach as the server: plan inside a savepoint that is always rolled back.
      await this.client.send({ type: "exec", sql: "SAVEPOINT lens" });
      try {
        const r = await this.client.send<QueryResult>({
          type: "query",
          sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
          params,
        });
        const doc = (r.rows[0]?.["QUERY PLAN"] as Row[] | undefined)?.[0] as Row | undefined;
        plan = doc?.Plan as PlanNode | undefined;
        planning = doc?.["Planning Time"] as number | undefined;
        execution = doc?.["Execution Time"] as number | undefined;
        triggers = ((doc?.Triggers as Row[] | undefined) ?? []).map((t) => ({
          name: String(t["Trigger Name"]),
          relation: (t.Relation as string | undefined) ?? null,
          constraint: (t["Constraint Name"] as string | undefined) ?? null,
          calls: Number(t.Calls ?? 0),
          ms: Number(t.Time ?? 0),
        }));
      } finally {
        await this.client.send({
          type: "exec",
          sql: "ROLLBACK TO SAVEPOINT lens; RELEASE SAVEPOINT lens",
        });
      }
    }
    const started = performance.now();
    const result = await this.client.send<QueryResult>({ type: "query", sql, params });
    const ms = Math.round((performance.now() - started) * 1000) / 1000;
    this.trace?.statements.push({
      name,
      sql: sql.trim(),
      params: params.map((p) => (p === null ? "None" : String(p))),
      ms,
      rows: result.rows.length || result.affectedRows,
      ...(plan ? { plan, triggers, planning_ms: planning, execution_ms: execution } : {}),
    });
    return result.rows;
  }

  q(name: string, values: Row = {}): Promise<DbRow[]> {
    const q = query(name);
    return this.raw(q.text, bind(q, values), name);
  }

  async q1<T = Row>(name: string, values: Row = {}): Promise<T | null> {
    const rows = await this.q(name, values);
    return (rows[0] as T | undefined) ?? null;
  }

  async qv<T = unknown>(name: string, values: Row = {}): Promise<T | null> {
    const row = await this.q1(name, values);
    return row ? (Object.values(row)[0] as T) : null;
  }
}

function dbRole(p: Principal | null): string {
  if (!p) return "vamusic_anon";
  return p.role === "admin" ? "vamusic_admin" : "vamusic_listener";
}

export class BrowserApi implements Api {
  readonly mode = "browser" as const;
  private client = new WorkerClient();
  private queue: Promise<unknown> = Promise.resolve();
  private booted: Promise<BootInfo> | null = null;
  private readonly base: string;

  constructor(base: string) {
    this.base = base;
  }

  private progressListeners = new Set<(p: BootProgress) => void>();
  private lastProgress: BootProgress | null = null;

  /**
   * Start the database (once) and follow its progress. Several callers may subscribe, e.g.
   * React StrictMode running an effect twice; late subscribers get the latest step at once.
   */
  boot(onProgress: (p: BootProgress) => void): Promise<BootInfo> {
    this.progressListeners.add(onProgress);
    if (this.lastProgress) onProgress(this.lastProgress);
    this.booted ??= this.client.send<BootInfo>({ type: "boot", base: this.base }, (p) => {
      this.lastProgress = p;
      for (const listener of this.progressListeners) listener(p);
    });
    return this.booted;
  }

  /** Delete the in-browser database; the next load rebuilds it from the seed. */
  async reset(): Promise<void> {
    await this.client.send({ type: "reset" });
  }

  /** Run one request: a transaction as the caller's role. Requests never interleave. */
  private request<T>(
    label: string,
    fn: (tx: Tx) => Promise<T>,
    role: string | null = null,
  ): Promise<T> {
    const run = async () => {
      if (!this.booted) throw new Error("database not started");
      await this.booted;
      const principal = sessionStore.get();
      const effective = role ?? dbRole(principal);
      const trace: LensTrace | null = lens.capturing
        ? { role: effective, user_id: principal?.userId ?? null, total_ms: 0, statements: [] }
        : null;
      const tx = new Tx(this.client, trace);
      await this.client.send({ type: "exec", sql: "BEGIN" });
      try {
        await tx.raw(`SET LOCAL ROLE ${effective}`);
        await tx.raw("SELECT set_config('vamusic.user_id', $1, true)", [
          principal && role === null ? String(principal.userId) : "",
        ]);
        const result = await fn(tx);
        await this.client.send({ type: "exec", sql: "COMMIT" });
        if (trace) {
          trace.total_ms = Math.round(trace.statements.reduce((n, s) => n + s.ms, 0) * 1000) / 1000;
          lens.record(label, trace);
        }
        return result;
      } catch (err) {
        await this.client.send({ type: "exec", sql: "ROLLBACK" }).catch(() => undefined);
        throw err;
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private requireUser(): Principal {
    const p = sessionStore.get();
    if (!p) throw new ApiError(401, "sign in required");
    return p;
  }

  private requireAdmin(): Principal {
    const p = this.requireUser();
    if (p.role !== "admin") throw new ApiError(403, "admin only");
    return p;
  }

  // --- meta ----------------------------------------------------------------------------------

  health = () =>
    this.request("GET /health", async (tx) => {
      const row = (await tx.q1<{ postgres: string; role: string }>("meta.health"))!;
      return { status: "ok", version: "2.0.0-dev", ...row } as Health;
    });

  schema = () =>
    this.request("GET /schema", async (tx) => ({
      tables: await tx.q("meta.tables"),
      foreign_keys: await tx.q("meta.foreign_keys"),
    })) as Promise<SchemaInfo>;

  // --- auth ----------------------------------------------------------------------------------

  /** Verifies the bcrypt hash in SQL with pgcrypto (which spells the prefix $2a$). */
  login = (login: string, password: string) =>
    this.request(
      "POST /auth/login",
      async (tx) => {
        const row = await tx.q1<{
          user_id: number;
          public_id: string;
          username: string;
          display_name: string | null;
          password_hash: string;
          role: "listener" | "admin";
          is_active: boolean;
        }>("auth.login_lookup", { login });
        const ok =
          row &&
          (
            await tx.raw(
              "SELECT public.crypt($1, overlay($2 placing '$2a$' from 1 for 4)) = overlay($2 placing '$2a$' from 1 for 4) AS ok",
              [password, row.password_hash],
              "browser.verify_password",
            )
          )[0]?.ok;
        if (!row || !ok || !row.is_active) throw new ApiError(401, "wrong username or password");
        await tx.q("auth.touch_login", { user_id: row.user_id });
        sessionStore.set({
          userId: row.user_id,
          publicId: row.public_id,
          username: row.username,
          displayName: row.display_name,
          role: row.role,
          token: null,
        });
        return {
          token: "",
          role: row.role,
          user: { id: row.public_id, username: row.username, display_name: row.display_name },
        } satisfies Session;
      },
      "vamusic_app",
    );

  register = (username: string, email: string, password: string) =>
    this.request(
      "POST /auth/register",
      async (tx) => {
        const hashRow = await tx.raw(
          "SELECT public.crypt($1, public.gen_salt('bf', 10)) AS h",
          [password],
          "browser.hash_password",
        );
        const row = await tx.q1<{ user_id: number; public_id: string }>("auth.register", {
          username,
          email,
          password_hash: hashRow[0]?.h,
          display_name: null,
        });
        sessionStore.set({
          userId: row!.user_id,
          publicId: row!.public_id,
          username,
          displayName: username,
          role: "listener",
          token: null,
        });
        return {
          token: "",
          role: "listener",
          user: { id: row!.public_id, username, display_name: username },
        } satisfies Session;
      },
      "vamusic_app",
    );

  me = () => {
    this.requireUser();
    return this.request("GET /me", async (tx) => {
      const row = await tx.q1<Me>("auth.me");
      if (!row) throw new ApiError(404, "account not found");
      return row;
    });
  };

  // --- catalog -------------------------------------------------------------------------------

  genres = () => this.request("GET /genres", (tx) => tx.q("catalog.genres")) as Promise<Genre[]>;

  search = (q: string, limit = 20) =>
    this.request(`GET /search?q=${q}`, (tx) => tx.q("catalog.search", { q, limit })) as Promise<
      SearchHit[]
    >;

  trending = (opts: { genre?: number | null; limit?: number } = {}) =>
    this.request("GET /trending", (tx) =>
      tx.q("catalog.trending", { genre: opts.genre ?? null, limit: opts.limit ?? 20 }),
    ) as Promise<ScoredTrack[]>;

  track = (id: string) =>
    this.request(`GET /tracks/${id}`, async (tx) => {
      const row = await tx.q1<Track>("catalog.track", { id });
      if (!row) throw new ApiError(404, "track not found");
      return row;
    });

  similar = (id: string, limit = 12) =>
    this.request(`GET /tracks/${id}/similar`, (tx) =>
      tx.q("catalog.similar", { id, limit }),
    ) as Promise<ScoredTrack[]>;

  topArtists = (limit = 20) =>
    this.request("GET /artists", (tx) => tx.q("catalog.top_artists", { limit })) as Promise<
      Artist[]
    >;

  artist = (id: string) =>
    this.request(`GET /artists/${id}`, async (tx) => {
      const a = await tx.q1<Row>("catalog.artist", { id });
      if (!a) throw new ApiError(404, "artist not found");
      a.top_tracks = await tx.q("catalog.artist_top_tracks", { artist_id: a.artist_id });
      a.albums = await tx.q("catalog.artist_albums", { artist_id: a.artist_id });
      return a as unknown as Artist;
    });

  album = (id: string) =>
    this.request(`GET /albums/${id}`, async (tx) => {
      const a = await tx.q1<Row>("catalog.album", { id });
      if (!a) throw new ApiError(404, "album not found");
      a.tracks = await tx.q("catalog.album_tracks", { album_id: a.album_id });
      return a as unknown as Album;
    });

  // --- library -------------------------------------------------------------------------------

  private async pk(tx: Tx, name: string, id: string, what: string): Promise<number> {
    const pk = await tx.qv<number>(name, { id });
    if (pk == null) throw new ApiError(404, `${what} not found`);
    return pk;
  }

  likes = () => {
    this.requireUser();
    return this.request("GET /me/likes", (tx) => tx.q("library.likes", { limit: 100 })) as Promise<
      Track[]
    >;
  };

  like = (id: string) => {
    this.requireUser();
    return this.request(`PUT /me/likes/${id}`, async (tx) => {
      await tx.q("library.like", { track_id: await this.pk(tx, "library.track_pk", id, "track") });
    });
  };

  unlike = (id: string) => {
    this.requireUser();
    return this.request(`DELETE /me/likes/${id}`, async (tx) => {
      await tx.q("library.unlike", {
        track_id: await this.pk(tx, "library.track_pk", id, "track"),
      });
    });
  };

  follows = () => {
    this.requireUser();
    return this.request("GET /me/follows", (tx) => tx.q("library.follows")) as Promise<ArtistRef[]>;
  };

  follow = (id: string) => {
    this.requireUser();
    return this.request(`PUT /me/follows/${id}`, async (tx) => {
      await tx.q("library.follow", {
        artist_id: await this.pk(tx, "library.artist_pk", id, "artist"),
      });
    });
  };

  unfollow = (id: string) => {
    this.requireUser();
    return this.request(`DELETE /me/follows/${id}`, async (tx) => {
      await tx.q("library.unfollow", {
        artist_id: await this.pk(tx, "library.artist_pk", id, "artist"),
      });
    });
  };

  recordPlay = (play: PlayIn) => {
    this.requireUser();
    return this.request("POST /me/plays", async (tx) => {
      await tx.q("library.record_play", {
        track_id: await this.pk(tx, "library.track_pk", play.track_id, "track"),
        ms_played: Math.round(play.ms_played),
        completed: play.completed,
        device: play.device ?? "web",
        quality: play.quality ?? "high",
      });
    });
  };

  history = (limit = 50) => {
    this.requireUser();
    return this.request("GET /me/history", (tx) => tx.q("library.history", { limit })) as Promise<
      Play[]
    >;
  };

  recommendations = (limit = 20) => {
    this.requireUser();
    return this.request("GET /me/recommendations", (tx) =>
      tx.q("library.recommendations", { limit }),
    ) as Promise<ScoredTrack[]>;
  };

  wrapped = (year: number) => {
    this.requireUser();
    return this.request(`GET /me/wrapped?year=${year}`, async (tx) =>
      tx.qv<Wrapped>("library.wrapped", { year }),
    ) as Promise<Wrapped>;
  };

  // --- playlists -----------------------------------------------------------------------------

  private async loadPlaylist(tx: Tx, id: string): Promise<Row> {
    const row = await tx.q1<Row>("playlists.by_id", { id });
    if (!row) throw new ApiError(404, "playlist not found");
    return row;
  }

  private async owned(tx: Tx, id: string): Promise<number> {
    const row = await this.loadPlaylist(tx, id);
    if (!row.is_owner) throw new ApiError(403, "only the owner can change this playlist");
    return row.playlist_id as number;
  }

  private async fullPlaylist(tx: Tx, id: string): Promise<Playlist> {
    const row = await this.loadPlaylist(tx, id);
    row.tracks = await tx.q("playlists.tracks", { playlist_id: row.playlist_id });
    return row as unknown as Playlist;
  }

  myPlaylists = () => {
    this.requireUser();
    return this.request("GET /me/playlists", (tx) => tx.q("playlists.mine")) as Promise<
      PlaylistSummary[]
    >;
  };

  publicPlaylists = (limit = 20) =>
    this.request("GET /playlists", (tx) => tx.q("playlists.public", { limit })) as Promise<
      PlaylistSummary[]
    >;

  playlist = (id: string) =>
    this.request(`GET /playlists/${id}`, (tx) => this.fullPlaylist(tx, id));

  createPlaylist = (name: string, description: string | null = null, isPublic = true) => {
    this.requireUser();
    return this.request("POST /playlists", async (tx) => {
      const id = await tx.qv<string>("playlists.create", {
        name,
        description,
        is_public: isPublic,
      });
      return this.fullPlaylist(tx, id!);
    });
  };

  updatePlaylist = (id: string, patch: PlaylistPatch) => {
    this.requireUser();
    return this.request(`PATCH /playlists/${id}`, async (tx) => {
      await this.owned(tx, id);
      await tx.q("playlists.update", {
        id,
        name: patch.name ?? null,
        has_description: "description" in patch,
        description: patch.description ?? null,
        is_public: patch.is_public ?? null,
      });
      return this.fullPlaylist(tx, id);
    });
  };

  deletePlaylist = (id: string) => {
    this.requireUser();
    return this.request(`DELETE /playlists/${id}`, async (tx) => {
      await this.owned(tx, id);
      await tx.q("playlists.delete", { id });
    });
  };

  addToPlaylist = (id: string, trackId: string) => {
    this.requireUser();
    return this.request(`POST /playlists/${id}/tracks`, async (tx) => {
      const pk = await this.owned(tx, id);
      const track = await this.pk(tx, "library.track_pk", trackId, "track");
      await tx.q("playlists.add_track", { playlist_id: pk, track_id: track });
      return this.fullPlaylist(tx, id);
    });
  };

  removeFromPlaylist = (id: string, trackId: string) => {
    this.requireUser();
    return this.request(`DELETE /playlists/${id}/tracks/${trackId}`, async (tx) => {
      await tx.q("playlists.remove_track", {
        playlist_id: await this.owned(tx, id),
        track_id: trackId,
      });
      return this.fullPlaylist(tx, id);
    });
  };

  reorderPlaylist = (id: string, trackIds: string[]) => {
    this.requireUser();
    return this.request(`PUT /playlists/${id}/order`, async (tx) => {
      await tx.q("playlists.reorder", {
        playlist_id: await this.owned(tx, id),
        track_ids: `{${trackIds.join(",")}}`,
      });
      return this.fullPlaylist(tx, id);
    });
  };

  followPlaylist = (id: string) => {
    this.requireUser();
    return this.request(`PUT /playlists/${id}/follow`, async (tx) => {
      const row = await this.loadPlaylist(tx, id);
      await tx.q("playlists.follow", { playlist_id: row.playlist_id });
    });
  };

  unfollowPlaylist = (id: string) => {
    this.requireUser();
    return this.request(`DELETE /playlists/${id}/follow`, async (tx) => {
      const row = await this.loadPlaylist(tx, id);
      await tx.q("playlists.unfollow", { playlist_id: row.playlist_id });
    });
  };

  // --- admin ---------------------------------------------------------------------------------

  adminOverview = () => {
    this.requireAdmin();
    return this.request("GET /admin/overview", async (tx) => ({
      counts: (await tx.q1("admin.counts")) as Record<string, number>,
      revenue_this_month: Number((await tx.qv("admin.revenue")) ?? 0),
      plays_last_30_days: await tx.q("admin.daily_plays"),
      top_tracks: await tx.q("admin.top_tracks"),
      partitions: await tx.q("admin.partitions"),
    })) as Promise<Overview>;
  };

  audit = (limit = 50) => {
    this.requireAdmin();
    return this.request("GET /admin/audit", (tx) =>
      tx.q("admin.audit", { table: null, limit }),
    ) as Promise<AuditEntry[]>;
  };

  refresh = () => {
    this.requireAdmin();
    return this.request("POST /admin/refresh", (tx) => tx.q("admin.refresh")) as Promise<
      { view_name: string; duration_ms: number }[]
    >;
  };

  updateArtist = (
    id: string,
    patch: { name?: string; bio?: string | null; verified?: boolean },
  ) => {
    this.requireAdmin();
    return this.request(`PATCH /admin/artists/${id}`, async (tx) => {
      const row = await tx.q1<ArtistRef>("admin.update_artist", {
        id,
        name: patch.name ?? null,
        has_bio: "bio" in patch,
        bio: patch.bio ?? null,
        verified: patch.verified ?? null,
      });
      if (!row) throw new ApiError(404, "artist not found");
      return row;
    });
  };
}
