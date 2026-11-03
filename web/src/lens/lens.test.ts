import { describe, expect, it } from "vitest";
import { copyableSql } from "./copy";
import { explainNode } from "./planNodes";

describe("explainNode", () => {
  it("explains common node types", () => {
    expect(explainNode("Seq Scan")).toMatch(/every row/);
    expect(explainNode("Memoize")).toMatch(/nested loop/);
  });

  it("explains parallel variants with the plain sentence", () => {
    expect(explainNode("Parallel Seq Scan")).toBe(explainNode("Seq Scan"));
  });

  it("returns undefined for types it doesn't know", () => {
    expect(explainNode("Custom Scan")).toBeUndefined();
  });
});

describe("copyableSql", () => {
  it("puts the query name and parameters above the SQL as comments", () => {
    const text = copyableSql({
      name: "catalog.search",
      sql: "  SELECT * FROM vamusic.search_tracks($1, $2)\n",
      params: ["midnite\ntran", "20"],
    });
    expect(text).toBe(
      [
        "-- catalog.search",
        "-- $1 = midnite tran",
        "-- $2 = 20",
        "SELECT * FROM vamusic.search_tracks($1, $2)",
      ].join("\n"),
    );
  });

  it("copies setup statements without a header", () => {
    expect(copyableSql({ name: null, sql: "SET LOCAL ROLE vamusic_anon", params: [] })).toBe(
      "SET LOCAL ROLE vamusic_anon",
    );
  });
});
