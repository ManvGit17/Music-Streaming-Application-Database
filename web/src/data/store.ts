import { useSyncExternalStore } from "react";
import type { LensTrace, Role } from "./types";

/** A tiny observable store, read in React through useSyncExternalStore. */
function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the app still works.
  }
}

// --- session -----------------------------------------------------------------------------------

export interface Principal {
  /** Internal user id: needed to set vamusic.user_id in browser mode. */
  userId: number;
  publicId: string;
  username: string;
  displayName: string | null;
  role: Role;
  /** Bearer token in server mode; unused in browser mode. */
  token: string | null;
}

const SESSION_KEY = "vamusic.session";
export const sessionStore = createStore<Principal | null>(load(SESSION_KEY, null));
sessionStore.subscribe(() => save(SESSION_KEY, sessionStore.get()));

export function useSession(): Principal | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
}

// --- SQL Lens ----------------------------------------------------------------------------------

export interface LensEntry {
  id: number;
  label: string;
  at: number;
  trace: LensTrace;
}

interface LensState {
  open: boolean;
  entries: LensEntry[];
}

const LENS_KEY = "vamusic.lens.open";
export const lensStore = createStore<LensState>({ open: load(LENS_KEY, false), entries: [] });
let nextId = 1;

export const lens = {
  /** Plans are only captured while the drawer is open: EXPLAIN ANALYZE runs each query twice. */
  get capturing(): boolean {
    return lensStore.get().open;
  },
  toggle(open?: boolean) {
    lensStore.set((s) => ({ ...s, open: open ?? !s.open }));
    save(LENS_KEY, lensStore.get().open);
  },
  record(label: string, trace: LensTrace) {
    lensStore.set((s) => ({
      ...s,
      entries: [{ id: nextId++, label, at: Date.now(), trace }, ...s.entries].slice(0, 40),
    }));
  },
  clear() {
    lensStore.set((s) => ({ ...s, entries: [] }));
  },
};

export function useLens(): LensState {
  return useSyncExternalStore(lensStore.subscribe, lensStore.get);
}

// --- theme -------------------------------------------------------------------------------------

export type Theme = "system" | "light" | "dark";

// Stored as a plain string (not JSON) because index.html reads it before the app loads.
const THEME_KEY = "vamusic.theme";

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export const themeStore = createStore<Theme>(readTheme());

export function setTheme(theme: Theme): void {
  themeStore.set(theme);
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function useTheme(): Theme {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get);
}
