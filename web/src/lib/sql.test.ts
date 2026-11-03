import { describe, expect, it } from "vitest";
import { bind, parseQueries, queries } from "./sql";

describe("parseQueries", () => {
  it("turns named placeholders into positional ones, reusing repeats", () => {
    const [q] = parseQueries("-- name: x\nSELECT :a, :b::text, :a FROM t", "ns").values();
    expect(q?.name).toBe("ns.x");
    expect(q?.text).toBe("SELECT $1, $2::text, $1 FROM t");
    expect(q?.params).toEqual(["a", "b"]);
  });

  it("leaves casts and comment lines alone", () => {
    const [q] = parseQueries(
      "-- name: x\n-- Note: not a :param\nSELECT 'x'::regclass, CAST(:id AS uuid)",
      "ns",
    ).values();
    expect(q?.params).toEqual(["id"]);
    expect(q?.text).toContain("-- Note: not a :param");
    expect(q?.text).toContain("CAST($1 AS uuid)");
  });

  it("rejects duplicates and empty queries", () => {
    expect(() => parseQueries("-- name: a\nSELECT 1;\n-- name: a\nSELECT 2;", "ns")).toThrow(
      /duplicate/,
    );
    expect(() => parseQueries("-- name: a\n\n-- name: b\nSELECT 1;", "ns")).toThrow(/empty/);
  });
});

describe("bind", () => {
  it("orders values by placeholder and requires every one", () => {
    const [q] = parseQueries("-- name: x\nSELECT :b, :a", "ns").values();
    expect(bind(q!, { a: 1, b: 2 })).toEqual([2, 1]);
    expect(() => bind(q!, { a: 1 })).toThrow(/needs :b/);
  });
});

describe("shared query files", () => {
  it("loads the same queries the Python API uses", () => {
    const names = [...queries().keys()];
    expect(names).toContain("catalog.search");
    expect(names).toContain("playlists.reorder");
    expect(names.length).toBeGreaterThan(40);
  });
});
