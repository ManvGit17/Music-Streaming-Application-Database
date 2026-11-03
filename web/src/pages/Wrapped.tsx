import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Navigate } from "react-router";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useWrapped } from "@/data/hooks";
import { useSession } from "@/data/store";
import { cn, count } from "@/lib/util";

function Card({
  children,
  className,
  technique,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  technique: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "glass relative flex flex-col gap-4 overflow-hidden rounded-[2rem] p-7",
        className,
      )}
    >
      {children}
      <p className="mt-auto pt-2 font-mono text-[0.6875rem] text-faint">{technique}</p>
    </motion.section>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const hour = (h: number) =>
  h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;

export default function WrappedPage() {
  const session = useSession();
  const [year, setYear] = useState(2026);
  const wrapped = useWrapped(year);

  if (!session) return <Navigate to="/sign-in" replace />;

  const w = wrapped.data;
  const peak = w?.by_hour.reduce((a, b) => (b.plays > a.plays ? b : a), { hour: 0, plays: 0 });
  const maxHour = Math.max(1, ...(w?.by_hour.map((b) => b.plays) ?? [1]));

  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">One SQL function: listener_wrapped()</p>
          <h1 className="text-5xl md:text-7xl">
            Your <em className="text-accent">{year}</em> in music
          </h1>
        </div>
        <fieldset className="glass m-0 flex min-w-0 gap-1 rounded-full p-1">
          <legend className="sr-only">Year</legend>
          {[2025, 2026].map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={y === year}
              onClick={() => setYear(y)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-medium",
                y === year ? "bg-ink text-bg" : "text-muted hover:text-ink",
              )}
            >
              {y}
            </button>
          ))}
        </fieldset>
      </header>

      {wrapped.isError ? (
        <ErrorState error={wrapped.error} retry={() => void wrapped.refetch()} />
      ) : !w ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-64 rounded-[2rem] md:col-span-2" />
          <Skeleton className="h-64 rounded-[2rem]" />
        </div>
      ) : w.plays === 0 ? (
        <EmptyState title={`No listening in ${year}`}>Play a few songs and come back.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            className="md:col-span-2"
            technique="GROUPING SETS ((artist), (genre), ()) computes all three totals in one pass"
          >
            <p className="eyebrow">Minutes listened</p>
            <p className="font-display text-7xl leading-none text-accent md:text-9xl tabular">
              {count(w.minutes)}
            </p>
            <p className="text-lg text-muted">
              across {count(w.plays)} plays of {count(w.distinct_tracks)} different songs.
            </p>
          </Card>

          <Card technique="percent_rank() over every listener's minutes that year" delay={0.08}>
            <p className="eyebrow">Compared with everyone</p>
            <p className="font-display text-6xl leading-none">
              Top <span className="text-accent">{w.top_percent ?? 100}%</span>
            </p>
            <p className="text-muted">of VaMusic listeners by time spent listening.</p>
          </Card>

          <Card
            technique="top 5 by plays, from a partition-pruned scan of listening_event"
            delay={0.04}
          >
            <p className="eyebrow">Top songs</p>
            <ol className="flex flex-col gap-3">
              {w.top_tracks.map((t, i) => (
                <li key={t.id} className="flex items-baseline gap-3">
                  <span className="w-6 font-display text-2xl text-accent">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {t.artist} · {t.plays} plays
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card technique="the (artist) grouping set" delay={0.1}>
            <p className="eyebrow">Top artists</p>
            <ol className="flex flex-col gap-3">
              {w.top_artists.map((a, i) => (
                <li key={a.id} className="flex items-baseline gap-3">
                  <span className="w-6 font-display text-2xl text-accent">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                  <span className="text-sm text-faint tabular">{count(a.minutes)} min</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card technique="the (genre) grouping set, as a share of the grand total" delay={0.16}>
            <p className="eyebrow">Your genres</p>
            <ul className="flex flex-col gap-3">
              {w.top_genres.map((g) => (
                <li key={g.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-faint tabular">{Math.round(g.share * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line-strong">
                    <motion.div
                      className="h-full rounded-full bg-accent"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${g.share * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="md:col-span-2" technique="extract(hour) … GROUP BY, in UTC" delay={0.04}>
            <p className="eyebrow">When you listen</p>
            <p className="text-lg">
              You play the most around{" "}
              <span className="font-display text-2xl text-accent">{hour(peak?.hour ?? 0)}</span>.
            </p>
            <div
              className="flex h-36 items-end gap-1"
              role="img"
              aria-label="Plays by hour of the day"
            >
              {HOURS.map((h) => {
                const plays = w.by_hour.find((b) => b.hour === h)?.plays ?? 0;
                return (
                  <div key={h} className="flex flex-1 flex-col items-center gap-1">
                    <motion.div
                      className={cn(
                        "w-full rounded-t-md",
                        h === peak?.hour ? "bg-accent" : "bg-line-strong",
                      )}
                      initial={{ height: 0 }}
                      whileInView={{ height: `${(plays / maxHour) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: h * 0.015, ease: [0.16, 1, 0.3, 1] }}
                    />
                    {h % 6 === 0 ? (
                      <span className="text-[0.625rem] text-faint">{hour(h)}</span>
                    ) : (
                      <span className="text-[0.625rem]">&nbsp;</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card
            technique="gaps and islands: day − row_number() is constant across a streak"
            delay={0.1}
          >
            <p className="eyebrow">Longest streak</p>
            <p className="font-display text-7xl leading-none text-accent tabular">
              {w.longest_streak?.days ?? 0}
            </p>
            <p className="text-muted">
              days in a row
              {w.longest_streak ? `, ${w.longest_streak.from} to ${w.longest_streak.to}` : ""}.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
