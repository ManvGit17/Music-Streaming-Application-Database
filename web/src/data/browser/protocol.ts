/** Messages between the app and the PGlite worker. */

export interface BootProgress {
  step: "open" | "migrate" | "seed" | "finish" | "ready";
  label: string;
  /** Overall progress, 0..1. */
  fraction: number;
}

export interface BootInfo {
  postgres: string;
  fresh: boolean;
  persisted: boolean;
  seconds: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  affectedRows: number;
}

export type Request =
  | { id: number; type: "boot"; base: string }
  | { id: number; type: "query"; sql: string; params: unknown[] }
  | { id: number; type: "exec"; sql: string }
  | { id: number; type: "reset" };

export type Response =
  | { id: number; type: "progress"; progress: BootProgress }
  | { id: number; type: "ok"; result: unknown }
  | { id: number; type: "error"; message: string; code?: string; stack?: string };
