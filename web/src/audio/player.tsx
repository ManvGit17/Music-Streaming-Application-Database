import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/data/api";
import { sessionStore } from "@/data/store";
import type { Track } from "@/data/types";
import { AudioEngine } from "./engine";

/** Plays shorter than this aren't recorded as listens (a quick skip isn't a play). */
const MIN_RECORDED_MS = 5000;

export type Repeat = "off" | "all" | "one";

interface PlayerState {
  queue: Track[];
  index: number;
  playing: boolean;
  shuffle: boolean;
  repeat: Repeat;
  volume: number;
}

interface PlayerApi extends PlayerState {
  current: Track | null;
  engine: AudioEngine | null;
  play(track: Track, queue?: Track[]): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(ms: number): void;
  setVolume(v: number): void;
  setShuffle(on: boolean): void;
  cycleRepeat(): void;
  enqueue(track: Track): void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

// Position changes many times a second; keep it out of React state and let views subscribe.
const position = {
  value: 0,
  listeners: new Set<() => void>(),
  set(ms: number) {
    this.value = ms;
    for (const l of this.listeners) l();
  },
};

export function usePosition(): number {
  return useSyncExternalStore(
    (l) => {
      position.listeners.add(l);
      return () => position.listeners.delete(l);
    },
    () => position.value,
  );
}

function hueOf(track: Track): number {
  return track.genre_hue ?? track.artist.hue;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const engineRef = useRef<AudioEngine | null>(null);
  const [state, setState] = useState<PlayerState>({
    queue: [],
    index: -1,
    playing: false,
    shuffle: false,
    repeat: "off",
    volume: 0.8,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const listened = useRef({ trackId: "", ms: 0 });

  const engine = useCallback(() => {
    engineRef.current ??= new AudioEngine();
    return engineRef.current;
  }, []);

  const record = useCallback(
    (track: Track, ms: number, completed: boolean) => {
      if (!sessionStore.get() || ms < MIN_RECORDED_MS) return;
      api
        .recordPlay({ track_id: track.id, ms_played: ms, completed })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["me"] });
          void queryClient.invalidateQueries({ queryKey: ["history"] });
        })
        .catch(() => undefined);
    },
    [queryClient],
  );

  const start = useCallback(
    (queue: Track[], index: number) => {
      const prev = stateRef.current.queue[stateRef.current.index];
      const e = engine();
      // Record a skipped track; a finished one was already recorded by advance().
      if (prev && listened.current.trackId === prev.id) record(prev, e.positionMs, false);
      const track = queue[index];
      if (!track) return;
      e.load({ seed: track.audio_seed, durationMs: track.duration_ms, features: track.features });
      void e.play(0);
      listened.current = { trackId: track.id, ms: 0 };
      position.set(0);
      setState((s) => ({ ...s, queue, index, playing: true }));
    },
    [engine, record],
  );

  const advance = useCallback(
    (direction: 1 | -1, ended = false) => {
      const s = stateRef.current;
      if (!s.queue.length) return;
      if (ended) {
        const finished = s.queue[s.index];
        if (finished) {
          record(finished, finished.duration_ms, true);
          // The finished track is recorded here, so start() mustn't record it again.
          listened.current = { trackId: "", ms: 0 };
        }
        if (s.repeat === "one") {
          start(s.queue, s.index);
          return;
        }
      }
      let index = s.index + direction;
      if (s.shuffle && direction === 1 && s.queue.length > 1) {
        do index = Math.floor(Math.random() * s.queue.length);
        while (index === s.index);
      }
      if (index >= s.queue.length) {
        if (s.repeat !== "all") {
          engineRef.current?.stop();
          position.set(0);
          setState((st) => ({ ...st, playing: false }));
          return;
        }
        index = 0;
      }
      if (index < 0) index = 0;
      start(s.queue, index);
    },
    [record, start],
  );

  // Advance when a song ends; keep the position store ticking while playing.
  useEffect(() => {
    if (!state.playing) return;
    const e = engine();
    e.onEnded = () => advance(1, true);
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 200) {
        position.set(e.positionMs);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.playing, engine, advance]);

  const current = state.queue[state.index] ?? null;

  // The interface takes its accent colour from what's playing.
  useEffect(() => {
    if (current) document.documentElement.style.setProperty("--ambient-h", String(hueOf(current)));
  }, [current]);

  const api_: PlayerApi = useMemo(
    () => ({
      ...state,
      current,
      engine: engineRef.current,
      play(track, queue) {
        const q = queue?.length ? queue : [track];
        const i = Math.max(
          0,
          q.findIndex((t) => t.id === track.id),
        );
        start(q, i);
      },
      toggle() {
        const e = engine();
        if (!current) return;
        if (state.playing) {
          e.pause();
          position.set(e.positionMs);
          setState((s) => ({ ...s, playing: false }));
        } else {
          void e.play();
          setState((s) => ({ ...s, playing: true }));
        }
      },
      next: () => advance(1),
      previous() {
        const e = engine();
        if (e.positionMs > 3000) {
          e.seek(0);
          position.set(0);
        } else advance(-1);
      },
      seek(ms) {
        engine().seek(ms);
        position.set(ms);
      },
      setVolume(v) {
        engine().setVolume(v);
        setState((s) => ({ ...s, volume: v }));
      },
      setShuffle: (on) => setState((s) => ({ ...s, shuffle: on })),
      cycleRepeat: () =>
        setState((s) => ({
          ...s,
          repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
        })),
      enqueue: (track) =>
        setState((s) =>
          s.queue.length
            ? { ...s, queue: [...s.queue, track] }
            : { ...s, queue: [track], index: 0 },
        ),
    }),
    [state, current, start, advance, engine],
  );

  // Hardware media keys and the operating system's now-playing controls.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist.name,
      album: current.album.title,
    });
    navigator.mediaSession.setActionHandler("play", () => api_.toggle());
    navigator.mediaSession.setActionHandler("pause", () => api_.toggle());
    navigator.mediaSession.setActionHandler("nexttrack", () => api_.next());
    navigator.mediaSession.setActionHandler("previoustrack", () => api_.previous());
  }, [current, api_]);

  return <PlayerContext value={api_}>{children}</PlayerContext>;
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer outside PlayerProvider");
  return ctx;
}
