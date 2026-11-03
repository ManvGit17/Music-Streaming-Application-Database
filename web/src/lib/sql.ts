/**
 * The shared named queries from db/queries/*.sql, the same files the Python API runs.
 *
 * Each query is a `-- name: <name>` block with `:param` placeholders. Here they become
 * PostgreSQL's positional `$1, $2, ...` for PGlite; the API turns them into psycopg's
 * `%(name)s`. Both sides follow the same rules: `::type` casts and comment lines are left alone.
 */

const HEADER = /^--\s*name:\s*([a-z_][a-z0-9_]*)\s*$/;
const PARAM = /(?<![:\w]):([a-z_][a-z0-9_]*)/g;

export interface NamedQuery {
  name: string;
  source: string;
  /** The query with $n placeholders. */
  text: string;
  /** Parameter names, in $n order. */
  params: string[];
}

export function parseQueries(text: string, namespace: string): Map<string, NamedQuery> {
  const found = new Map<string, NamedQuery>();
  let name: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (name === null) return;
    const source = body.join("\n").trim();
    const key = `${namespace}.${name}`;
    if (!source) throw new Error(`${key} is empty`);
    const params: string[] = [];
    const converted = source
      .split("\n")
      .map((line) =>
        line.trimStart().startsWith("--")
          ? line
          : line.replace(PARAM, (_m, p: string) => {
              let index = params.indexOf(p);
              if (index === -1) index = params.push(p) - 1;
              return `$${index + 1}`;
            }),
      )
      .join("\n");
    found.set(key, { name: key, source, text: converted, params });
  };

  for (const line of text.split(/\r?\n/)) {
    const header = HEADER.exec(line);
    if (header) {
      flush();
      name = header[1] ?? null;
      if (found.has(`${namespace}.${name}`))
        throw new Error(`duplicate query ${namespace}.${name}`);
      body = [];
    } else if (name !== null) {
      body.push(line);
    }
  }
  flush();
  return found;
}

/** Positional values for a query, from named ones. Missing parameters are an error. */
export function bind(query: NamedQuery, values: Record<string, unknown>): unknown[] {
  return query.params.map((p) => {
    if (!(p in values)) throw new Error(`${query.name} needs :${p}`);
    const v = values[p];
    return v === undefined ? null : v;
  });
}

const files = import.meta.glob<string>("@db/queries/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

let cache: Map<string, NamedQuery> | null = null;

export function queries(): Map<string, NamedQuery> {
  if (cache) return cache;
  cache = new Map();
  for (const [path, text] of Object.entries(files)) {
    const namespace = path
      .split("/")
      .pop()!
      .replace(/\.sql$/, "");
    for (const [k, v] of parseQueries(text, namespace)) cache.set(k, v);
  }
  return cache;
}

export function query(name: string): NamedQuery {
  const q = queries().get(name);
  if (!q) throw new Error(`unknown query ${name}`);
  return q;
}
