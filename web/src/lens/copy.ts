import type { LensStatement } from "@/data/types";

/** A statement as text to paste into psql: its parameters as comments above the SQL. */
export function copyableSql(s: Pick<LensStatement, "name" | "sql" | "params">): string {
  const header = [
    ...(s.name ? [`-- ${s.name}`] : []),
    ...s.params.map((p, i) => `-- $${i + 1} = ${p.replace(/\s+/g, " ")}`),
  ];
  return [...header, s.sql.trim()].join("\n");
}
