import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { PlanNode } from "@/data/types";
import { cn } from "@/lib/util";

function nodeDetail(node: PlanNode): string {
  const parts: string[] = [];
  if (node["Index Name"]) parts.push(`using ${node["Index Name"]}`);
  if (node["Relation Name"]) parts.push(`on ${node["Relation Name"]}`);
  else if (node["Function Name"]) parts.push(`${String(node["Function Name"])}()`);
  return parts.join(" ");
}

function exclusive(node: PlanNode): number {
  // Actual Total Time is per loop and includes children; subtract them to get this node's own share.
  const loops = node["Actual Loops"] ?? 1;
  const total = (node["Actual Total Time"] ?? 0) * loops;
  const children = (node.Plans ?? []).reduce(
    (n, c) => n + (c["Actual Total Time"] ?? 0) * (c["Actual Loops"] ?? 1),
    0,
  );
  return Math.max(0, total - children);
}

function tone(type: string): string {
  if (/Index|Bitmap/.test(type)) return "text-good";
  if (/Seq Scan/.test(type)) return "text-warn";
  return "text-ink";
}

function Node({ node, depth, rootMs }: { node: PlanNode; depth: number; rootMs: number }) {
  const [open, setOpen] = useState(depth < 3);
  const own = exclusive(node);
  const share = rootMs > 0 ? Math.min(1, own / rootMs) : 0;
  const kids = node.Plans ?? [];
  const extra = Object.entries(node).filter(
    ([k, v]) =>
      [
        "Filter",
        "Index Cond",
        "Hash Cond",
        "Join Filter",
        "Sort Key",
        "Order By",
        "Recheck Cond",
        "Subplans Removed",
      ].includes(k) && v != null,
  );
  return (
    <li>
      <div className="relative rounded-lg py-1 pr-2" style={{ paddingLeft: depth * 14 }}>
        <div
          aria-hidden
          className="absolute inset-y-0.5 left-0 rounded-md bg-accent-soft"
          style={{ width: `${Math.max(share * 100, 0.5)}%` }}
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={kids.length || extra.length ? open : undefined}
          className="relative flex w-full items-start gap-1.5 text-left"
        >
          <ChevronRight
            className={cn(
              "mt-0.5 size-3.5 shrink-0 text-faint transition-transform",
              open && "rotate-90",
              !(kids.length || extra.length) && "invisible",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className={cn("font-medium", tone(node["Node Type"]))}>{node["Node Type"]}</span>{" "}
            <span className="text-muted">{nodeDetail(node)}</span>
          </span>
          <span className="shrink-0 text-faint tabular">
            {node["Actual Rows"] ?? "–"} rows · {own.toFixed(2)} ms
          </span>
        </button>
        {open && extra.length ? (
          <dl className="relative mt-1 ml-5 grid grid-cols-[auto_1fr] gap-x-2 text-faint">
            {extra.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd className="truncate font-mono">
                  {Array.isArray(v) ? v.join(", ") : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {open && kids.length ? (
        <ul>
          {kids.map((k, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: plan children have no ids
            <Node key={i} node={k} depth={depth + 1} rootMs={rootMs} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** An EXPLAIN ANALYZE plan as a tree; each node's bar is its share of the execution time. */
export function PlanTree({ plan }: { plan: PlanNode }) {
  const rootMs = (plan["Actual Total Time"] ?? 0) * (plan["Actual Loops"] ?? 1);
  return (
    <ul className="text-xs" aria-label="Query plan">
      <Node node={plan} depth={0} rootMs={rootMs} />
    </ul>
  );
}
