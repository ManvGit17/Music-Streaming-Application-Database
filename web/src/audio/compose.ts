/**
 * Turns a track's seed and audio features into a song plan: tempo, key, chords, arrangement.
 *
 * Pure and deterministic, so the same track always sounds the same and seeking to any bar
 * reproduces exactly what would have played there.
 */

import { mulberry32 } from "@/lib/util";

export interface Features {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  tempo: number;
}

export interface Song {
  bpm: number;
  /** MIDI note of the key's root, in the bass register. */
  root: number;
  /** Scale degrees (semitones from the root) available to melody and chords. */
  scale: number[];
  /** One chord per bar, as semitone offsets of its triad from the key root. */
  progression: number[][];
  /** Bars in the whole song. */
  bars: number;
  /** Intensity per bar in [0, 1]: drives which layers play. */
  intensity: number[];
  /** A 16-step drum pattern per voice. */
  drums: { kick: number[]; snare: number[]; hat: number[] };
  /** A two-bar melodic motif: [step, scale index] pairs. */
  motif: [number, number][];
  /** 0 = soft sine/triangle timbres, 1 = brighter sawtooth timbres. */
  brightness: number;
  features: Features;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

// Progressions as scale-degree indices (0 = I).
const PROGRESSIONS = [
  [0, 4, 5, 3],
  [5, 3, 0, 4],
  [0, 5, 3, 4],
  [1, 4, 0, 5],
  [0, 3, 4, 3],
  [5, 4, 3, 4],
];

export function toFeatures(values: number[] | null | undefined): Features {
  const v = (i: number, fallback: number) => {
    const x = values?.[i];
    return typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fallback;
  };
  return {
    energy: v(0, 0.5),
    valence: v(1, 0.5),
    danceability: v(2, 0.5),
    acousticness: v(3, 0.4),
    instrumentalness: v(4, 0.3),
    speechiness: v(5, 0.05),
    liveness: v(6, 0.2),
    tempo: v(7, 0.5),
  };
}

function triad(scale: number[], degree: number): number[] {
  const at = (i: number) => {
    const octave = Math.floor(i / scale.length);
    return (scale[i % scale.length] ?? 0) + 12 * octave;
  };
  return [at(degree), at(degree + 2), at(degree + 4)];
}

export function compose(seed: number, durationMs: number, values?: number[] | null): Song {
  const f = toFeatures(values);
  const rand = mulberry32(seed || 1);

  const bpm = Math.round(72 + f.tempo * 80);
  const barMs = (60_000 / bpm) * 4;
  const bars = Math.max(4, Math.round(durationMs / barMs));

  const root = 40 + Math.floor(rand() * 12); // E2 .. D#3
  const scale =
    f.valence > 0.62 ? (rand() < 0.3 ? LYDIAN : MAJOR) : f.valence > 0.4 ? DORIAN : MINOR;
  const shape = PROGRESSIONS[Math.floor(rand() * PROGRESSIONS.length)] ?? PROGRESSIONS[0]!;
  const progression = Array.from({ length: bars }, (_, bar) =>
    triad(scale, shape[bar % shape.length] ?? 0),
  );

  // Arrangement in 8-bar phrases: intro, verse, chorus, verse, chorus, bridge, chorus, outro.
  const phrases = [0.35, 0.6, 1, 0.65, 1, 0.45, 1, 0.3];
  const intensity = Array.from({ length: bars }, (_, bar) => {
    const phrase = Math.floor(bar / 8);
    const base = bar >= bars - 4 ? 0.25 : (phrases[phrase % phrases.length] ?? 0.6);
    const fadeIn = Math.min(1, (bar + 1) / 2);
    return Math.min(1, base * (0.55 + 0.45 * f.energy) * fadeIn + 0.1);
  });

  const steps = (density: number, anchors: number[]) =>
    Array.from({ length: 16 }, (_, i) =>
      anchors.includes(i) ? 1 : rand() < density ? 0.55 + rand() * 0.3 : 0,
    );
  const drumsOn = f.energy > 0.3 && f.acousticness < 0.8;
  const drums = {
    kick: drumsOn
      ? steps(f.danceability * 0.18, f.danceability > 0.6 ? [0, 4, 8, 12] : [0, 10])
      : [],
    snare: drumsOn ? steps(0.04, [4, 12]) : [],
    hat: drumsOn ? steps(0.25 + f.energy * 0.5, [2, 6, 10, 14]) : [],
  };

  const motif: [number, number][] = [];
  for (let step = 0; step < 32; step += rand() < 0.5 ? 2 : 4) {
    if (rand() < 0.75) motif.push([step, Math.floor(rand() * 8)]);
  }

  return {
    bpm,
    root,
    scale,
    progression,
    bars,
    intensity,
    drums,
    motif,
    brightness: Math.min(1, Math.max(0, f.energy * 0.7 + (1 - f.acousticness) * 0.4 - 0.15)),
    features: f,
  };
}

export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
