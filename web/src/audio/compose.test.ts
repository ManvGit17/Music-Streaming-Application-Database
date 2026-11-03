import { describe, expect, it } from "vitest";
import { compose, midiToHz, toFeatures } from "./compose";

const calm = [0.2, 0.3, 0.2, 0.9, 0.9, 0.04, 0.2, 0.3];
const club = [0.9, 0.8, 0.9, 0.05, 0.6, 0.05, 0.1, 0.75];

describe("compose", () => {
  it("is deterministic for a seed", () => {
    expect(compose(123, 200_000, club)).toEqual(compose(123, 200_000, club));
    expect(compose(124, 200_000, club).root).not.toBeNaN();
  });

  it("fills the track's duration", () => {
    const song = compose(1, 180_000, club);
    const barMs = (60_000 / song.bpm) * 4;
    expect(Math.abs(song.bars * barMs - 180_000)).toBeLessThan(barMs);
    expect(song.progression).toHaveLength(song.bars);
    expect(song.intensity).toHaveLength(song.bars);
  });

  it("maps features to tempo, mode and drums", () => {
    const fast = compose(7, 200_000, club);
    const slow = compose(7, 200_000, calm);
    expect(fast.bpm).toBeGreaterThan(slow.bpm);
    expect(fast.drums.kick.length).toBe(16);
    expect(slow.drums.kick).toEqual([]); // acoustic, low-energy tracks have no drum kit
    expect(slow.scale).toContain(3); // low valence: a minor third
  });

  it("keeps intensity in range and fades in", () => {
    const song = compose(9, 240_000, club);
    expect(song.intensity.every((x) => x >= 0 && x <= 1)).toBe(true);
    expect(song.intensity[0]!).toBeLessThan(song.intensity[20]!);
  });
});

describe("helpers", () => {
  it("defaults missing features and clamps them", () => {
    expect(toFeatures(null).energy).toBe(0.5);
    expect(toFeatures([2, -1]).energy).toBe(1);
    expect(toFeatures([2, -1]).valence).toBe(0);
  });

  it("converts MIDI notes to Hz", () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBe(880);
  });
});
