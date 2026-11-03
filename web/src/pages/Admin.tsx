import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";
import { TrackList } from "@/components/music";
import { Badge, Button, ErrorState, Section, Skeleton } from "@/components/ui";
import { api } from "@/data/api";
import { useTopArtists } from "@/data/hooks";
import { useSession } from "@/data/store";
import type { Overview } from "@/data/types";
import { cn, count } from "@/lib/util";

function PlaysChart({ data }: { data: Overview["plays_last_30_days"] }) {
  const { path, area, max } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.plays));
    const pts = data.map(
      (d, i) => [(i / Math.max(1, data.length - 1)) * 100, 100 - (d.plays / max) * 92] as const,
    );
    const line = pts
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");
    return { path: line, area: `${line} L100,100 L0,100 Z`, max };
  }, [data]);
  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={`Daily plays over the last ${data.length} days, peaking at ${max}`}
      >
        <defs>
          <linearGradient id="plays-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#plays-fill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex justify-between text-xs text-faint">
        <span>{data[0]?.day}</span>
        <span>peak {count(max)} plays/day</span>
        <span>{data.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}

export default function AdminPage() {
  const session = useSession();
  const client = useQueryClient();
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: api.adminOverview,
    enabled: session?.role === "admin",
  });
  const audit = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => api.audit(20),
    enabled: session?.role === "admin",
  });
  const artists = useTopArtists(8);
  const [timings, setTimings] = useState<{ view_name: string; duration_ms: number }[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (!session) return <Navigate to="/sign-in" replace />;
  if (session.role !== "admin") {
    return (
      <div className="pt-6">
        <ErrorState
          error={
            new Error(
              "This workspace needs the vamusic_admin role. Sign in as “admin” (password: vamusic).",
            )
          }
        />
      </div>
    );
  }

  const refresh = async () => {
    setRefreshing(true);
    try {
      setTimings(await api.refresh());
      void client.invalidateQueries();
      toast.success("Rollups refreshed concurrently: readers were never blocked");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const verify = async (id: string, verified: boolean) => {
    try {
      await api.updateArtist(id, { verified: !verified });
      void client.invalidateQueries({ queryKey: ["artists"] });
      void client.invalidateQueries({ queryKey: ["admin", "audit"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const o = overview.data;
  const maxBytes = Math.max(1, ...(o?.partitions.map((p) => p.bytes) ?? [1]));

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden /> Running as vamusic_admin
          </p>
          <h1 className="text-4xl md:text-5xl">Operations</h1>
        </div>
        <Button variant="primary" busy={refreshing} onClick={() => void refresh()}>
          <RefreshCw className="size-4" aria-hidden /> Refresh rollups
        </Button>
      </header>

      {overview.isError ? (
        <ErrorState error={overview.error} retry={() => void overview.refetch()} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {o
          ? [
              ["Listeners", o.counts.listeners],
              ["Tracks", o.counts.tracks],
              ["Plays", o.counts.plays],
              ["Revenue this month", `$${o.revenue_this_month.toFixed(2)}`],
            ].map(([label, value]) => (
              <div key={String(label)} className="glass rounded-2xl p-5">
                <p className="eyebrow">{label}</p>
                <p className="mt-1 font-display text-3xl tabular">
                  {typeof value === "number" ? count(value) : value}
                </p>
              </div>
            ))
          : ["a", "b", "c", "d"].map((k) => <Skeleton key={k} className="h-24 rounded-2xl" />)}
      </div>

      {timings ? (
        <div className="glass rounded-2xl p-5" aria-live="polite">
          <p className="eyebrow mb-3">REFRESH MATERIALIZED VIEW CONCURRENTLY</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {timings.map((t) => (
              <li
                key={t.view_name}
                className="flex justify-between rounded-lg bg-sunk px-3 py-2 font-mono text-sm"
              >
                <span>{t.view_name}</span>
                <span className="text-accent tabular">{t.duration_ms.toFixed(1)} ms</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Plays per day" eyebrow="daily_track_play rollup">
          <div className="glass rounded-2xl p-5">
            {o ? <PlaysChart data={o.plays_last_30_days} /> : <Skeleton className="h-40" />}
          </div>
        </Section>
        <Section title="Partitions" eyebrow="listening_event, one table per month">
          <ul className="glass flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-2xl p-4">
            {o?.partitions.map((p) => (
              <li
                key={p.name}
                className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-xs"
              >
                <span className="font-mono">{p.name.replace("listening_event_", "")}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-line-strong">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(p.bytes / maxBytes) * 100}%` }}
                  />
                </span>
                <span className="text-faint tabular">~{count(p.estimated_rows)} rows</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Verify artists" eyebrow="Each change is captured by audit.capture()">
          <ul className="glass flex flex-col gap-1 rounded-2xl p-2">
            {artists.data?.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-hover"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                <button
                  type="button"
                  aria-pressed={a.verified}
                  onClick={() => void verify(a.id, a.verified)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
                    a.verified ? "bg-accent-soft text-accent" : "glass text-muted hover:text-ink",
                  )}
                >
                  <BadgeCheck className="size-3.5" aria-hidden />{" "}
                  {a.verified ? "Verified" : "Verify"}
                </button>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Audit log" eyebrow="audit.change_log, secrets redacted">
          <ol
            className="glass flex max-h-96 flex-col gap-2 overflow-y-auto rounded-2xl p-3"
            aria-live="polite"
          >
            {audit.data?.length ? (
              audit.data.map((e) => (
                <li key={e.id} className="rounded-xl bg-sunk p-3 text-xs">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={e.operation === "DELETE" ? "warn" : "accent"}>{e.operation}</Badge>
                    <span className="font-mono">{e.table}</span>
                    <span className="text-faint">
                      by {e.actor ?? "system"} as {e.db_role} · {new Date(e.at).toLocaleString()}
                    </span>
                  </div>
                  {e.after ? (
                    <code className="block truncate font-mono text-muted">
                      {Object.entries(e.after)
                        .filter(([k]) => k !== "updated_at")
                        .map(
                          ([k, v]) =>
                            `${k}: ${JSON.stringify(e.before?.[k] ?? null)} → ${JSON.stringify(v)}`,
                        )
                        .join(", ")}
                    </code>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="p-4 text-center text-sm text-muted">
                No changes yet. Verify an artist to see one appear.
              </li>
            )}
          </ol>
        </Section>
      </div>

      <Section title="Most played" eyebrow="track_stat">
        {o ? <TrackList tracks={o.top_tracks} /> : <Skeleton className="h-64" />}
      </Section>
    </div>
  );
}
