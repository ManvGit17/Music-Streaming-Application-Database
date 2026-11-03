import { ChevronDown, Database, Trash2, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Badge, IconButton } from "@/components/ui";
import { api } from "@/data/api";
import { type LensEntry, lens, useLens } from "@/data/store";
import type { LensStatement } from "@/data/types";
import { cn } from "@/lib/util";
import { PlanTree } from "./PlanTree";
import { SqlCode } from "./SqlCode";

const ROLE_NOTE: Record<string, string> = {
  vamusic_anon: "signed out: RLS shows only public rows",
  vamusic_listener: "a listener: RLS limits private tables to their own rows",
  vamusic_admin: "an admin: policies allow every row",
  vamusic_app: "the API's own role, which can only call the sign-in functions",
};

function Statement({ s }: { s: LensStatement }) {
  const [open, setOpen] = useState(false);
  const setup = !s.name;
  return (
    <li className={cn("rounded-xl border border-line", setup && "opacity-75")}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-faint transition-transform", !open && "-rotate-90")}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {s.name ?? s.sql.split("\n")[0]}
        </span>
        {s.triggers?.length ? (
          <Badge tone="warn">
            <Zap className="size-3" aria-hidden />
            {s.triggers.length}
          </Badge>
        ) : null}
        <span className="shrink-0 text-xs text-faint tabular">{s.ms.toFixed(1)} ms</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-line px-3 pt-2 pb-3">
          <SqlCode sql={s.sql} />
          {s.params.length ? (
            <p className="text-xs text-muted">
              <span className="eyebrow mr-2">Params</span>
              {s.params.map((p, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional parameters
                <code key={i} className="mr-2 rounded bg-sunk px-1 font-mono">
                  ${i + 1} = {p}
                </code>
              ))}
            </p>
          ) : null}
          <p className="text-xs text-faint tabular">
            {s.rows} rows
            {s.planning_ms != null ? ` · planned in ${s.planning_ms.toFixed(2)} ms` : ""}
            {s.execution_ms != null ? ` · executed in ${s.execution_ms.toFixed(2)} ms` : ""}
          </p>
          {s.triggers?.length ? (
            <div>
              <p className="eyebrow mb-1.5">Triggers fired</p>
              <ul className="flex flex-col gap-1 text-xs">
                {s.triggers.map((t) => (
                  <li
                    key={`${t.name}${t.relation}`}
                    className="flex justify-between gap-2 rounded-lg bg-sunk px-2 py-1"
                  >
                    <span className="truncate font-mono">
                      {t.constraint ? `${t.constraint} (foreign key)` : t.name}
                      {t.relation ? <span className="text-faint"> on {t.relation}</span> : null}
                    </span>
                    <span className="shrink-0 text-faint tabular">
                      {t.calls}× · {t.ms.toFixed(2)} ms
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {s.plan ? (
            <div>
              <p className="eyebrow mb-1.5">Execution plan</p>
              <PlanTree plan={s.plan} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Entry({ entry, first }: { entry: LensEntry; first: boolean }) {
  const [open, setOpen] = useState(first);
  const queries = entry.trace.statements.filter((s) => s.name);
  return (
    <li className="glass rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm">{entry.label}</span>
          <span className="text-xs text-faint">
            {queries.length} {queries.length === 1 ? "query" : "queries"} as {entry.trace.role}
          </span>
        </span>
        <span className="text-sm font-medium text-accent tabular">
          {entry.trace.total_ms.toFixed(1)} ms
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <p className="px-1 text-xs text-muted">
            One transaction, run as <code className="font-mono">{entry.trace.role}</code>
            {entry.trace.user_id ? ` (user ${entry.trace.user_id})` : ""}:{" "}
            {ROLE_NOTE[entry.trace.role] ?? ""}.
          </p>
          <ul className="flex flex-col gap-1.5">
            {entry.trace.statements.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: statements are ordered and immutable
              <Statement key={i} s={s} />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/** The SQL Lens: every statement the app ran, its plan, and the triggers it set off. */
export function LensDrawer() {
  const { open, entries } = useLens();
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="lens"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 32 }}
          aria-label="SQL Lens"
          className="glass fixed inset-y-0 right-0 z-40 flex w-full max-w-[30rem] flex-col border-y-0 border-r-0 shadow-float md:top-3 md:right-3 md:bottom-28 md:rounded-3xl md:border"
        >
          <header className="flex items-start gap-3 border-b border-line px-5 pt-5 pb-4">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Database className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl">SQL Lens</h2>
              <p className="text-xs text-muted">
                Every statement behind what you see, with its plan. Running on{" "}
                {api.mode === "browser" ? "PostgreSQL 18 in your browser" : "the VaMusic API"}.
              </p>
            </div>
            <IconButton size="sm" label="Clear the log" onClick={() => lens.clear()}>
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
            <IconButton size="sm" label="Close the SQL Lens" onClick={() => lens.toggle(false)}>
              <X className="size-4" aria-hidden />
            </IconButton>
          </header>
          <div className="flex-1 overflow-y-auto p-3">
            {entries.length ? (
              <ul className="flex flex-col gap-2" aria-live="polite">
                {entries.map((e, i) => (
                  <Entry key={e.id} entry={e} first={i === 0} />
                ))}
              </ul>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-sm text-muted">
                <p className="font-display text-lg text-ink">Watching for queries</p>
                <p>
                  Play a song, search, or open any page. Each request appears here with its SQL,
                  execution plan and the triggers it fired.
                </p>
              </div>
            )}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
