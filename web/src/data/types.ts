/** Shapes returned by the API (mirroring src/vamusic/api/schemas.py) and the Api contract. */

export type Role = "listener" | "admin";

export interface ArtistRef {
  id: string;
  name: string;
  hue: number;
}

export interface AlbumRef {
  id: string;
  title: string;
  cover_seed: number;
}

export interface Track {
  id: string;
  title: string;
  duration_ms: number;
  explicit: boolean;
  audio_seed: number;
  track_number: number | null;
  artist: ArtistRef;
  album: AlbumRef;
  genre: string | null;
  genre_hue: number | null;
  plays: number;
  likes: number;
  liked: boolean;
  /** Eight audio features in [0, 1]; drive the generative audio. */
  features?: number[] | null;
}

export interface ScoredTrack extends Track {
  score: number;
  reason?: string | null;
}

export interface SearchHit extends Track {
  score: number;
  lexical_rank: number | null;
  fuzzy_rank: number | null;
}

export interface Genre {
  id: number;
  name: string;
  description: string | null;
  hue: number;
  tracks: number;
}

export interface Album {
  id: string;
  title: string;
  album_type: string;
  release_date: string | null;
  label: string | null;
  cover_seed: number;
  genre: string | null;
  artist: ArtistRef;
  tracks: Track[];
}

export interface Artist {
  id: string;
  name: string;
  bio: string | null;
  country: string | null;
  verified: boolean;
  hue: number;
  monthly_listeners: number;
  followers: number;
  total_plays: number;
  following: boolean;
  albums: Album[];
  top_tracks: Track[];
}

export interface UserRef {
  id: string;
  username: string;
  display_name: string | null;
}

export interface Me {
  id: string;
  username: string;
  display_name: string | null;
  country: string | null;
  email: string;
  role: Role;
  joined: string;
  tier: string;
  plays: number;
  minutes: number;
  plan: string | null;
}

export interface Session {
  token: string;
  role: Role;
  user: UserRef;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  cover_seed: number;
  owner: UserRef;
  track_count: number;
  duration_ms: number;
  followers: number;
  updated_at: string;
  is_owner?: boolean;
}

export interface Playlist extends PlaylistSummary {
  tracks: Track[];
  is_owner: boolean;
}

export interface Play {
  track: Track;
  played_at: string;
  ms_played: number;
  completed: boolean;
  device: string;
}

export interface Wrapped {
  year: number;
  minutes: number;
  plays: number;
  distinct_tracks: number;
  top_percent: number | null;
  top_tracks: { id: string; title: string; artist: string; plays: number }[];
  top_artists: { id: string; name: string; minutes: number }[];
  top_genres: { name: string; share: number }[];
  by_hour: { hour: number; plays: number }[];
  median_session_ms: number | null;
  longest_streak: { days: number; from: string; to: string } | null;
}

export interface Overview {
  counts: Record<string, number>;
  revenue_this_month: number;
  plays_last_30_days: { day: string; plays: number; listener_days: number }[];
  top_tracks: Track[];
  partitions: { name: string; bounds: string; estimated_rows: number; bytes: number }[];
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string | null;
  db_role: string;
  table: string;
  operation: string;
  row_key: Record<string, unknown>;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  generated: "stored" | "virtual" | null;
  identity: boolean;
}

export interface SchemaTable {
  name: string;
  kind: "table" | "partitioned" | "materialized view" | "view";
  comment: string | null;
  rls: boolean;
  estimated_rows: number;
  columns: SchemaColumn[];
  policies: string[];
}

export interface SchemaInfo {
  tables: SchemaTable[];
  foreign_keys: {
    name: string;
    from_table: string;
    from_columns: string[];
    to_table: string;
    on_delete: string;
  }[];
}

export interface Health {
  status: string;
  version: string;
  postgres: string;
  role: string;
}

// --- SQL Lens --------------------------------------------------------------------------------

export interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Rows"?: number;
  "Actual Total Time"?: number;
  "Actual Loops"?: number;
  "Plan Rows"?: number;
  Plans?: PlanNode[];
  [key: string]: unknown;
}

export interface LensStatement {
  name: string | null;
  sql: string;
  params: string[];
  ms: number;
  rows: number;
  plan?: PlanNode;
  triggers?: {
    name: string;
    relation: string | null;
    constraint: string | null;
    calls: number;
    ms: number;
  }[];
  planning_ms?: number | null;
  execution_ms?: number | null;
}

export interface LensTrace {
  role: string;
  user_id: number | null;
  total_ms: number;
  statements: LensStatement[];
}

// --- the contract both data sources implement --------------------------------------------------

export interface PlayIn {
  track_id: string;
  ms_played: number;
  completed: boolean;
  device?: string;
  quality?: string;
}

export interface PlaylistPatch {
  name?: string;
  description?: string | null;
  is_public?: boolean;
}

export interface Api {
  readonly mode: "server" | "browser";

  health(): Promise<Health>;
  schema(): Promise<SchemaInfo>;

  login(login: string, password: string): Promise<Session>;
  register(username: string, email: string, password: string): Promise<Session>;
  me(): Promise<Me>;

  genres(): Promise<Genre[]>;
  search(q: string, limit?: number): Promise<SearchHit[]>;
  trending(opts?: { genre?: number | null; limit?: number }): Promise<ScoredTrack[]>;
  track(id: string): Promise<Track>;
  similar(id: string, limit?: number): Promise<ScoredTrack[]>;
  topArtists(limit?: number): Promise<Artist[]>;
  artist(id: string): Promise<Artist>;
  album(id: string): Promise<Album>;

  likes(): Promise<Track[]>;
  like(trackId: string): Promise<void>;
  unlike(trackId: string): Promise<void>;
  follows(): Promise<ArtistRef[]>;
  follow(artistId: string): Promise<void>;
  unfollow(artistId: string): Promise<void>;
  recordPlay(play: PlayIn): Promise<void>;
  history(limit?: number): Promise<Play[]>;
  recommendations(limit?: number): Promise<ScoredTrack[]>;
  wrapped(year: number): Promise<Wrapped>;

  myPlaylists(): Promise<PlaylistSummary[]>;
  publicPlaylists(limit?: number): Promise<PlaylistSummary[]>;
  playlist(id: string): Promise<Playlist>;
  createPlaylist(name: string, description?: string | null, isPublic?: boolean): Promise<Playlist>;
  updatePlaylist(id: string, patch: PlaylistPatch): Promise<Playlist>;
  deletePlaylist(id: string): Promise<void>;
  addToPlaylist(id: string, trackId: string): Promise<Playlist>;
  removeFromPlaylist(id: string, trackId: string): Promise<Playlist>;
  reorderPlaylist(id: string, trackIds: string[]): Promise<Playlist>;
  followPlaylist(id: string): Promise<void>;
  unfollowPlaylist(id: string): Promise<void>;

  adminOverview(): Promise<Overview>;
  audit(limit?: number): Promise<AuditEntry[]>;
  refresh(): Promise<{ view_name: string; duration_ms: number }[]>;
  updateArtist(
    id: string,
    patch: { name?: string; bio?: string | null; verified?: boolean },
  ): Promise<ArtistRef>;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
