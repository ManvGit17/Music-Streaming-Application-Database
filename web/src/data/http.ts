/**
 * Server mode: talks to the FastAPI service. While the SQL Lens is open, every request adds
 * ?lens=plan and the server returns its statements, timings and plans alongside the data.
 */

import { lens, sessionStore } from "./store";
import {
  type Album,
  type Api,
  ApiError,
  type Artist,
  type ArtistRef,
  type AuditEntry,
  type Genre,
  type Health,
  type LensTrace,
  type Me,
  type Overview,
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
} from "./types";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Keep the session, taking the internal user id from the token's claims. */
function remember(session: Session): Session {
  let userId = 0;
  try {
    const payload = session.token.split(".")[1] ?? "";
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      uid?: number;
    };
    userId = claims.uid ?? 0;
  } catch {
    // The id is only used for display in server mode; the token is what matters.
  }
  sessionStore.set({
    userId,
    publicId: session.user.id,
    username: session.user.username,
    displayName: session.user.display_name,
    role: session.role,
    token: session.token,
  });
  return session;
}

export class HttpApi implements Api {
  readonly mode = "server" as const;
  private readonly base: string;

  constructor(base: string) {
    this.base = base;
  }

  private async call<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const url = new URL(`${this.base}/api${path}`, window.location.href);
    const capture = lens.capturing;
    if (capture) url.searchParams.set("lens", "plan");

    const headers: Record<string, string> = {};
    const token = sessionStore.get()?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && token) sessionStore.set(null);
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const err = (await res.json()) as { detail?: unknown };
        detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      } catch {
        // keep the status text
      }
      throw new ApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    const json = (await res.json()) as unknown;
    if (capture && json && typeof json === "object" && "lens" in json) {
      const { data, lens: trace } = json as { data: T; lens: LensTrace };
      lens.record(`${method} ${path}`, trace);
      return data;
    }
    return json as T;
  }

  health = () => this.call<Health>("GET", "/health");
  schema = () => this.call<SchemaInfo>("GET", "/schema");

  async login(login: string, password: string): Promise<Session> {
    return remember(await this.call<Session>("POST", "/auth/login", { login, password }));
  }

  async register(username: string, email: string, password: string): Promise<Session> {
    return remember(
      await this.call<Session>("POST", "/auth/register", { username, email, password }),
    );
  }

  me = () => this.call<Me>("GET", "/me");

  genres = () => this.call<Genre[]>("GET", "/genres");
  search = (q: string, limit = 20) =>
    this.call<SearchHit[]>("GET", `/search?${new URLSearchParams({ q, limit: String(limit) })}`);
  trending = (opts: { genre?: number | null; limit?: number } = {}) => {
    const params = new URLSearchParams({ limit: String(opts.limit ?? 20) });
    if (opts.genre != null) params.set("genre", String(opts.genre));
    return this.call<ScoredTrack[]>("GET", `/trending?${params}`);
  };
  track = (id: string) => this.call<Track>("GET", `/tracks/${id}`);
  similar = (id: string, limit = 12) =>
    this.call<ScoredTrack[]>("GET", `/tracks/${id}/similar?limit=${limit}`);
  topArtists = (limit = 20) => this.call<Artist[]>("GET", `/artists?limit=${limit}`);
  artist = (id: string) => this.call<Artist>("GET", `/artists/${id}`);
  album = (id: string) => this.call<Album>("GET", `/albums/${id}`);

  likes = () => this.call<Track[]>("GET", "/me/likes");
  like = (id: string) => this.call<void>("PUT", `/me/likes/${id}`);
  unlike = (id: string) => this.call<void>("DELETE", `/me/likes/${id}`);
  follows = () => this.call<ArtistRef[]>("GET", "/me/follows");
  follow = (id: string) => this.call<void>("PUT", `/me/follows/${id}`);
  unfollow = (id: string) => this.call<void>("DELETE", `/me/follows/${id}`);
  recordPlay = async (play: PlayIn) => {
    await this.call<unknown>("POST", "/me/plays", play);
  };
  history = (limit = 50) => this.call<Play[]>("GET", `/me/history?limit=${limit}`);
  recommendations = (limit = 20) =>
    this.call<ScoredTrack[]>("GET", `/me/recommendations?limit=${limit}`);
  wrapped = (year: number) => this.call<Wrapped>("GET", `/me/wrapped?year=${year}`);

  myPlaylists = () => this.call<PlaylistSummary[]>("GET", "/me/playlists");
  publicPlaylists = (limit = 20) =>
    this.call<PlaylistSummary[]>("GET", `/playlists?limit=${limit}`);
  playlist = (id: string) => this.call<Playlist>("GET", `/playlists/${id}`);
  createPlaylist = (name: string, description: string | null = null, isPublic = true) =>
    this.call<Playlist>("POST", "/playlists", { name, description, is_public: isPublic });
  updatePlaylist = (id: string, patch: PlaylistPatch) =>
    this.call<Playlist>("PATCH", `/playlists/${id}`, patch);
  deletePlaylist = (id: string) => this.call<void>("DELETE", `/playlists/${id}`);
  addToPlaylist = (id: string, trackId: string) =>
    this.call<Playlist>("POST", `/playlists/${id}/tracks`, { track_id: trackId });
  removeFromPlaylist = (id: string, trackId: string) =>
    this.call<Playlist>("DELETE", `/playlists/${id}/tracks/${trackId}`);
  reorderPlaylist = (id: string, trackIds: string[]) =>
    this.call<Playlist>("PUT", `/playlists/${id}/order`, { track_ids: trackIds });
  followPlaylist = (id: string) => this.call<void>("PUT", `/playlists/${id}/follow`);
  unfollowPlaylist = (id: string) => this.call<void>("DELETE", `/playlists/${id}/follow`);

  adminOverview = () => this.call<Overview>("GET", "/admin/overview");
  audit = (limit = 50) => this.call<AuditEntry[]>("GET", `/admin/audit?limit=${limit}`);
  refresh = () => this.call<{ view_name: string; duration_ms: number }[]>("POST", "/admin/refresh");
  updateArtist = (id: string, patch: { name?: string; bio?: string | null; verified?: boolean }) =>
    this.call<ArtistRef>("PATCH", `/admin/artists/${id}`, patch);
}
