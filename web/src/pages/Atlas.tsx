import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { Layers, Shield, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, ErrorState, IconButton, Skeleton } from "@/components/ui";
import { useSchema } from "@/data/hooks";
import { useTheme } from "@/data/store";
import type { SchemaTable } from "@/data/types";
import { cn, count } from "@/lib/util";

const WIDTH = 230;
/** The tables the Atlas opens on; everything else is a scroll or zoom away. */
const CORE = ["artist", "album", "track", "listening_event", "app_user", "playlist", "track_like"];
const COLLAPSED_COLUMNS = 6;

type TableData = { table: SchemaTable; selected: boolean };

const KIND_TONE: Record<SchemaTable["kind"], string> = {
  table: "border-line-strong",
  partitioned: "border-accent",
  "materialized view": "border-warn/60",
  view: "border-good/50 border-dashed",
};

function TableNode({ data }: NodeProps<Node<TableData>>) {
  const t = data.table;
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface-strong text-ink shadow-float backdrop-blur-xl transition-shadow",
        KIND_TONE[t.kind],
        data.selected && "ring-2 ring-accent",
      )}
      style={{ width: WIDTH }}
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-faint" />
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] font-semibold">
          {t.name}
        </span>
        {t.rls ? (
          <Shield className="size-3.5 shrink-0 text-good" aria-label="Row-level security" />
        ) : null}
        {t.kind === "partitioned" ? (
          <Layers className="size-3.5 shrink-0 text-accent" aria-label="Partitioned" />
        ) : null}
      </div>
      <ul className="px-3 py-1.5 font-mono text-[0.6875rem]">
        {t.columns.slice(0, COLLAPSED_COLUMNS).map((c) => (
          <li key={c.name} className="flex justify-between gap-2 py-0.5">
            <span
              className={cn(
                "truncate",
                c.identity && "text-accent",
                c.generated && "italic text-muted",
              )}
            >
              {c.name}
            </span>
            <span className="truncate text-faint">
              {c.type.replace("timestamp with time zone", "timestamptz")}
            </span>
          </li>
        ))}
        {t.columns.length > COLLAPSED_COLUMNS ? (
          <li className="py-0.5 text-faint">+ {t.columns.length - COLLAPSED_COLUMNS} more</li>
        ) : null}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[0.625rem] text-faint">
        <span>{t.kind}</span>
        <span className="tabular">~{count(t.estimated_rows)} rows</span>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-faint" />
    </div>
  );
}

const nodeTypes = { table: TableNode };

const heightOf = (t: SchemaTable) => 70 + Math.min(t.columns.length, COLLAPSED_COLUMNS + 1) * 18;

/**
 * Tables linked by foreign keys are laid out top to bottom by dagre (referenced tables above
 * the ones that point at them). Views and rollups have no foreign keys, so they go in a row
 * underneath instead of piling up in one tall column.
 */
function layout(tables: SchemaTable[], edges: { from: string; to: string }[]) {
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of tables) {
    if (linked.has(t.name)) g.setNode(t.name, { width: WIDTH, height: heightOf(t) });
  }
  for (const e of edges) if (e.from !== e.to) g.setEdge(e.to, e.from);
  dagre.layout(g);

  const graph = g.graph();
  const top = (graph.height ?? 0) + 80;
  const loose = tables.filter((t) => !linked.has(t.name));
  const perRow = Math.max(1, Math.floor((graph.width ?? 1200) / (WIDTH + 36)));
  const positions = new Map<string, { x: number; y: number }>();
  loose.forEach((t, i) => {
    positions.set(t.name, {
      x: 20 + (i % perRow) * (WIDTH + 36),
      y: top + Math.floor(i / perRow) * 230,
    });
  });
  return (name: string) => {
    const fixed = positions.get(name);
    if (fixed) return fixed;
    const n = g.node(name);
    return { x: (n?.x ?? 0) - WIDTH / 2, y: (n?.y ?? 0) - (n?.height ?? 0) / 2 };
  };
}

function Details({ table, onClose }: { table: SchemaTable; onClose: () => void }) {
  return (
    <aside
      className="glass absolute top-3 right-3 bottom-3 z-10 flex w-80 flex-col overflow-hidden rounded-2xl bg-surface-strong shadow-float"
      aria-label={`Details of ${table.name}`}
    >
      <header className="flex items-start gap-2 border-b border-line p-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{table.kind}</p>
          <h2 className="truncate font-mono text-lg">{table.name}</h2>
        </div>
        <IconButton size="sm" label="Close details" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </header>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {table.comment ? <p className="mb-4 text-muted">{table.comment}</p> : null}
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Badge>~{count(table.estimated_rows)} rows</Badge>
          {table.rls ? <Badge tone="good">row-level security</Badge> : null}
        </div>
        {table.policies.length ? (
          <>
            <p className="eyebrow mb-1.5">Policies</p>
            <ul className="mb-4 flex flex-wrap gap-1.5">
              {table.policies.map((p) => (
                <li key={p}>
                  <code className="rounded bg-sunk px-1.5 py-0.5 font-mono text-xs">{p}</code>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="eyebrow mb-1.5">Columns</p>
        <ul className="flex flex-col gap-1 font-mono text-xs">
          {table.columns.map((c) => (
            <li key={c.name} className="flex justify-between gap-2 rounded-lg bg-sunk px-2 py-1">
              <span className={cn("truncate", c.identity && "text-accent")}>
                {c.name}
                {c.nullable ? "" : " *"}
              </span>
              <span className="truncate text-right text-faint">
                {c.type}
                {c.generated ? ` (${c.generated})` : ""}
                {c.identity ? " identity" : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export default function AtlasPage() {
  const schema = useSchema();
  const [selected, setSelected] = useState<string | null>(null);
  const theme = useTheme();
  const colorMode =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  const graph = useMemo(() => {
    if (!schema.data) return null;
    const { tables, foreign_keys } = schema.data;
    const links = foreign_keys.map((f) => ({ from: f.from_table, to: f.to_table }));
    const at = layout(tables, links);
    const nodes: Node<TableData>[] = tables.map((t) => ({
      id: t.name,
      type: "table",
      position: at(t.name),
      data: { table: t, selected: t.name === selected },
    }));
    const edges: Edge[] = foreign_keys
      .filter((f) => f.from_table !== f.to_table)
      .map((f) => ({
        id: f.name,
        source: f.to_table,
        target: f.from_table,
        type: "smoothstep",
        animated: f.from_table === selected || f.to_table === selected,
        label: f.from_columns.join(", "),
        labelStyle: { fontSize: 10, fill: "var(--text-faint)", fontFamily: "var(--font-mono)" },
        labelBgStyle: { fill: "var(--bg)" },
        style: {
          stroke:
            f.from_table === selected || f.to_table === selected
              ? "var(--accent)"
              : "var(--border-strong)",
          strokeWidth: 1.4,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border-strong)" },
      }));
    return { nodes, edges };
  }, [schema.data, selected]);

  const table = schema.data?.tables.find((t) => t.name === selected);

  return (
    <div className="flex flex-col gap-6 pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            Read live from pg_class, pg_attribute, pg_constraint and pg_policy
          </p>
          <h1 className="text-4xl md:text-5xl">Schema Atlas</h1>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <Shield className="size-3.5 text-good" aria-hidden /> row-level security
          </li>
          <li className="flex items-center gap-1.5">
            <Layers className="size-3.5 text-accent" aria-hidden /> partitioned by month
          </li>
          <li className="flex items-center gap-1.5">
            <span className="font-mono text-accent">id</span> identity column
          </li>
          <li className="flex items-center gap-1.5">
            <span className="font-mono italic">col</span> generated column
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded border border-warn/60" /> materialized view
          </li>
        </ul>
      </header>
      {schema.isError ? (
        <ErrorState error={schema.error} retry={() => void schema.refetch()} />
      ) : !graph ? (
        <Skeleton className="h-[70vh] rounded-3xl" />
      ) : (
        <div className="glass relative h-[72vh] overflow-hidden rounded-3xl">
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ nodes: CORE.map((id) => ({ id })), padding: 0.08, maxZoom: 1 }}
            minZoom={0.15}
            nodesDraggable
            onNodeClick={(_e, n) => setSelected(n.id)}
            onPaneClick={() => setSelected(null)}
            proOptions={{ hideAttribution: true }}
            colorMode={colorMode}
            aria-label="Database schema diagram"
          >
            <Background gap={24} color="var(--border)" />
            <Controls showInteractive={false} className="!rounded-xl !border-line !shadow-float" />
          </ReactFlow>
          {table ? <Details table={table} onClose={() => setSelected(null)} /> : null}
        </div>
      )}
      <p className="text-sm text-muted">
        Tables owned by the migrations, linked by their foreign keys. Click a table for its columns
        and policies. Monthly partitions of <code className="font-mono">listening_event</code> are
        hidden: the planner prunes them per query, which the SQL Lens shows.
      </p>
    </div>
  );
}
