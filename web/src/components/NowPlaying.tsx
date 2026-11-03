import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { usePlayer } from "@/audio/player";
import { useSimilar } from "@/data/hooks";
import { cn, duration } from "@/lib/util";
import { Cover } from "./Cover";
import { LikeButton } from "./music";
import { Seek } from "./PlayerBar";
import { IconButton } from "./ui";
import { Visualizer } from "./Visualizer";

/** The full-screen now-playing view: art, live spectrum, vector neighbours and the queue. */
export function NowPlaying({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const player = usePlayer();
  const t = player.current;
  const similar = useSimilar(open ? t?.id : undefined);
  if (!t) return null;
  const hue = t.genre_hue ?? t.artist.hue;
  const upNext = player.queue.slice(player.index + 1, player.index + 6);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 overflow-y-auto outline-none"
        >
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 scale-125 opacity-60 blur-3xl saturate-150"
          >
            <Cover seed={t.album.cover_seed} hue={hue} rounded="md" className="h-full w-full" />
          </div>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg"
          />

          <div className="relative mx-auto flex min-h-full max-w-6xl flex-col gap-10 px-6 py-6 md:px-10">
            <header className="flex items-center justify-between">
              <Dialog.Close asChild>
                <IconButton label="Close the now-playing view">
                  <ChevronDown className="size-5" aria-hidden />
                </IconButton>
              </Dialog.Close>
              <p className="eyebrow">Now playing · {t.genre ?? "Music"}</p>
              <span className="size-10" />
            </header>

            <div className="grid flex-1 items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <motion.div
                key={t.id}
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto w-full max-w-md"
              >
                <motion.div
                  animate={player.playing ? { scale: [1, 1.015, 1] } : { scale: 1 }}
                  transition={{
                    duration: 60 / 90,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }}
                >
                  <Cover
                    seed={t.album.cover_seed}
                    hue={hue}
                    rounded="xl"
                    className="shadow-[0_40px_80px_-30px_oklch(0_0_0/0.7)]"
                    label={`Cover of ${t.album.title}`}
                  />
                </motion.div>
              </motion.div>

              <div className="flex flex-col gap-6">
                <div>
                  <Dialog.Title asChild>
                    <h2 className="text-4xl leading-tight md:text-6xl">{t.title}</h2>
                  </Dialog.Title>
                  <p className="mt-2 text-lg text-muted">
                    <Link
                      to={`/artist/${t.artist.id}`}
                      onClick={() => onOpenChange(false)}
                      className="hover:text-ink hover:underline"
                    >
                      {t.artist.name}
                    </Link>{" "}
                    ·{" "}
                    <Link
                      to={`/album/${t.album.id}`}
                      onClick={() => onOpenChange(false)}
                      className="hover:text-ink hover:underline"
                    >
                      {t.album.title}
                    </Link>
                  </p>
                </div>

                <Visualizer
                  bars={48}
                  className={cn(
                    "h-24 w-full text-accent transition-opacity",
                    player.playing ? "opacity-100" : "opacity-30",
                  )}
                />

                <div className="flex flex-col gap-3">
                  <Seek />
                  <div className="flex items-center justify-center gap-3">
                    <LikeButton track={t} size="md" />
                    <IconButton label="Previous" onClick={player.previous}>
                      <SkipBack className="size-5 fill-current" aria-hidden />
                    </IconButton>
                    <button
                      type="button"
                      onClick={player.toggle}
                      aria-label={player.playing ? "Pause" : "Play"}
                      className="flex size-16 items-center justify-center rounded-full bg-accent text-on-accent shadow-float transition-transform hover:scale-105 active:scale-95"
                    >
                      {player.playing ? (
                        <Pause className="size-7 fill-current" aria-hidden />
                      ) : (
                        <Play className="ml-1 size-7 fill-current" aria-hidden />
                      )}
                    </button>
                    <IconButton label="Next" onClick={player.next}>
                      <SkipForward className="size-5 fill-current" aria-hidden />
                    </IconButton>
                    <span className="size-8" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-8 pb-10 md:grid-cols-2">
              <section aria-labelledby="sounds-like">
                <h3 id="sounds-like" className="text-2xl">
                  Sounds like this
                </h3>
                <p className="mb-3 text-sm text-muted">
                  Nearest neighbours of this track's 8 audio features, found through a pgvector HNSW
                  index.
                </p>
                <ul className="flex flex-col gap-1">
                  {(similar.data ?? []).slice(0, 6).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => player.play(s, similar.data)}
                        className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-hover"
                      >
                        <Cover
                          seed={s.album.cover_seed}
                          hue={s.genre_hue ?? s.artist.hue}
                          className="w-10"
                          rounded="md"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{s.title}</span>
                          <span className="block truncate text-sm text-muted">{s.artist.name}</span>
                        </span>
                        <span className="text-sm font-medium text-accent tabular">
                          {(s.score * 100).toFixed(1)}%
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="up-next">
                <h3 id="up-next" className="text-2xl">
                  Up next
                </h3>
                <p className="mb-3 text-sm text-muted">From your current queue.</p>
                {upNext.length ? (
                  <ul className="flex flex-col gap-1">
                    {upNext.map((q) => (
                      <li key={q.id} className="flex items-center gap-3 rounded-xl p-2">
                        <Cover
                          seed={q.album.cover_seed}
                          hue={q.genre_hue ?? q.artist.hue}
                          className="w-10"
                          rounded="md"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{q.title}</span>
                          <span className="block truncate text-sm text-muted">{q.artist.name}</span>
                        </span>
                        <span className="text-sm text-faint tabular">
                          {duration(q.duration_ms)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-faint">The queue ends after this track.</p>
                )}
              </section>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
