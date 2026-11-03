import { describe, expect, it } from "vitest";
import { count, duration, greeting, longDuration, mulberry32, plural } from "./util";

describe("mulberry32", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const drawsA = Array.from({ length: 50 }, a);
    expect(drawsA).toEqual(Array.from({ length: 50 }, b));
    expect(drawsA.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });
});

describe("formatting", () => {
  it("formats track durations", () => {
    expect(duration(59_000)).toBe("0:59");
    expect(duration(3_725_000)).toBe("1:02:05");
    expect(duration(-5)).toBe("0:00");
  });

  it("formats long durations, counts and plurals", () => {
    expect(longDuration(45 * 60000)).toBe("45 min");
    expect(longDuration(135 * 60000)).toBe("2 hr 15 min");
    expect(count(950)).toBe("950");
    expect(count(25_400)).toBe("25.4K");
    expect(plural(1, "track")).toBe("1 track");
    expect(plural(3, "track")).toBe("3 tracks");
  });

  it("greets by time of day", () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe("Good morning");
    expect(greeting(new Date(2026, 0, 1, 22))).toBe("Good evening");
  });
});

describe("cn", () => {
  it("lets a caller's Tailwind class override a component default", async () => {
    const { cn } = await import("./util");
    expect(cn("block w-full rounded-xl", "w-10")).toBe("block rounded-xl w-10");
    expect(cn("text-muted", false && "hidden", "text-accent")).toBe("text-accent");
  });
});
