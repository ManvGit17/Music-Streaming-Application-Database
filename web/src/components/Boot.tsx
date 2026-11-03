import { Check, Database, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { api, browserApi } from "@/data/api";
import type { BootInfo, BootProgress } from "@/data/browser/protocol";
import { Button } from "./ui";

type State =
  | { phase: "booting"; log: BootProgress[]; current: BootProgress | null }
  | { phase: "ready"; info: BootInfo | null }
  | { phase: "failed"; message: string };

/**
 * Gates the app until the database is reachable. In browser mode that means building
 * PostgreSQL in this tab on first visit, which the screen narrates step by step.
 */
export function Boot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: "booting", log: [], current: null });

  useEffect(() => {
    let cancelled = false;
    if (!browserApi) {
      api
        .health()
        .then(() => !cancelled && setState({ phase: "ready", info: null }))
        .catch(
          (err: Error) =>
            !cancelled &&
            setState({ phase: "failed", message: `Can't reach the VaMusic API: ${err.message}` }),
        );
      return () => {
        cancelled = true;
      };
    }
    browserApi
      .boot((p) => {
        if (cancelled) return;
        setState((s) => {
          if (s.phase !== "booting") return s;
          const done = s.current && s.current.label !== p.label ? [...s.log, s.current] : s.log;
          return { phase: "booting", log: done.slice(-8), current: p };
        });
      })
      .then((info) => !cancelled && setState({ phase: "ready", info }))
      .catch((err: Error) => !cancelled && setState({ phase: "failed", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "ready") return <>{children}</>;

  return (
    <div className="relative z-10 flex h-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="glass w-full max-w-lg rounded-[2rem] p-8 shadow-float"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Database className="size-6" aria-hidden />
          </div>
          <div>
            <p className="eyebrow">VaMusic</p>
            <h1 className="text-2xl">
              {state.phase === "failed" ? "The database didn't start" : "Starting the database"}
            </h1>
          </div>
        </div>

        {state.phase === "failed" ? (
          <div role="alert" className="flex flex-col gap-4">
            <p className="font-mono text-sm text-muted">{state.message}</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => window.location.reload()}>
                Try again
              </Button>
              {browserApi ? (
                <Button
                  onClick={async () => {
                    await browserApi?.reset().catch(() => undefined);
                    window.location.reload();
                  }}
                >
                  Rebuild from scratch
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm leading-relaxed text-muted">
              {browserApi
                ? "PostgreSQL 18 is running inside this tab. On your first visit it applies the project's real migrations and loads 20,000 plays with COPY. It's kept in your browser afterwards, so next time it opens instantly."
                : "Connecting to the VaMusic API…"}
            </p>
            <div
              className="mb-5 h-1.5 overflow-hidden rounded-full bg-line-strong"
              role="progressbar"
              aria-label="Database setup"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((state.current?.fraction ?? 0) * 100)}
            >
              <motion.div
                className="h-full rounded-full bg-accent"
                animate={{ width: `${Math.max(4, (state.current?.fraction ?? 0) * 100)}%` }}
                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.6 }}
              />
            </div>
            <ol className="flex flex-col gap-1.5 font-mono text-xs" aria-live="polite">
              <AnimatePresence initial={false}>
                {state.log.map((p) => (
                  <motion.li
                    key={p.label}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="flex items-center gap-2 text-faint"
                  >
                    <Check className="size-3.5 text-good" aria-hidden /> {p.label}
                  </motion.li>
                ))}
                {state.current ? (
                  <motion.li
                    key={`now-${state.current.label}`}
                    className="flex items-center gap-2 text-ink"
                  >
                    <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />{" "}
                    {state.current.label}
                  </motion.li>
                ) : null}
              </AnimatePresence>
            </ol>
          </>
        )}
      </motion.div>
    </div>
  );
}
