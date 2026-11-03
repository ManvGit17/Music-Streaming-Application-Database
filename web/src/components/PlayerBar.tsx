import * as Slider from "@radix-ui/react-slider";
import {
  ChevronUp,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { usePlayer, usePosition } from "@/audio/player";
import { cn, duration } from "@/lib/util";
import { Cover } from "./Cover";
import { LikeButton } from "./music";
import { IconButton } from "./ui";
import { Visualizer } from "./Visualizer";

function Seek() {
  const player = usePlayer();
  const pos = usePosition();
  const [dragging, setDragging] = useState<number | null>(null);
  const total = player.current?.duration_ms ?? 0;
  const value = dragging ?? Math.min(pos, total);
  return (
    <div className="flex w-full items-center gap-3 text-[0.6875rem] text-faint tabular">
      <span className="w-10 text-right">{duration(value)}</span>
      <Slider.Root
        className="group relative flex h-4 flex-1 touch-none items-center"
        min={0}
        max={Math.max(total, 1)}
        step={1000}
        value={[value]}
        disabled={!player.current}
        onValueChange={([v]) => setDragging(v ?? 0)}
        onValueCommit={([v]) => {
          player.seek(v ?? 0);
          setDragging(null);
        }}
        aria-label="Seek"
      >
        <Slider.Track className="relative h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
          <Slider.Range className="absolute h-full rounded-full bg-ink group-hover:bg-accent" />
        </Slider.Track>
        <Slider.Thumb
          aria-valuetext={`${duration(value)} of ${duration(total)}`}
          className="block size-3 rounded-full bg-ink opacity-0 shadow-float transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      </Slider.Root>
      <span className="w-10">{duration(total)}</span>
    </div>
  );
}

export function PlayerBar({ onExpand }: { onExpand: () => void }) {
  const player = usePlayer();
  const t = player.current;
  const VolumeIcon = player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;
  const RepeatIcon = player.repeat === "one" ? Repeat1 : Repeat;

  return (
    <section
      aria-label="Player"
      className="glass grid h-20 grid-cols-[1fr_auto] items-center gap-4 rounded-3xl px-3 shadow-float md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {t ? (
          <>
            <button
              type="button"
              onClick={onExpand}
              aria-label="Open the now-playing view"
              className="group relative w-14 shrink-0"
            >
              <Cover
                seed={t.album.cover_seed}
                hue={t.genre_hue ?? t.artist.hue}
                rounded="lg"
                className="shadow-float"
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                <ChevronUp className="size-5 text-white" aria-hidden />
              </span>
            </button>
            <div className="min-w-0">
              <p className="truncate font-medium">{t.title}</p>
              <Link
                to={`/artist/${t.artist.id}`}
                className="truncate text-sm text-muted hover:text-ink hover:underline"
              >
                {t.artist.name}
              </Link>
            </div>
            <LikeButton track={t} />
          </>
        ) : (
          <p className="text-sm text-faint">Nothing playing yet. Pick any song to start.</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            className="hidden md:inline-flex"
            label={player.shuffle ? "Turn shuffle off" : "Shuffle"}
            active={player.shuffle}
            onClick={() => player.setShuffle(!player.shuffle)}
          >
            <Shuffle className="size-4" aria-hidden />
          </IconButton>
          <IconButton
            size="sm"
            className="hidden md:inline-flex"
            label="Previous"
            onClick={player.previous}
            disabled={!t}
          >
            <SkipBack className="size-4 fill-current" aria-hidden />
          </IconButton>
          <button
            type="button"
            onClick={player.toggle}
            disabled={!t}
            aria-label={player.playing ? "Pause" : "Play"}
            className="flex size-11 items-center justify-center rounded-full bg-ink text-bg shadow-float transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
          >
            {player.playing ? (
              <Pause className="size-5 fill-current" aria-hidden />
            ) : (
              <Play className="ml-0.5 size-5 fill-current" aria-hidden />
            )}
          </button>
          <IconButton size="sm" label="Next" onClick={player.next} disabled={!t}>
            <SkipForward className="size-4 fill-current" aria-hidden />
          </IconButton>
          <IconButton
            size="sm"
            className="hidden md:inline-flex"
            label={`Repeat: ${player.repeat}`}
            active={player.repeat !== "off"}
            onClick={player.cycleRepeat}
          >
            <RepeatIcon className="size-4" aria-hidden />
          </IconButton>
        </div>
        <div className="hidden w-full max-w-xl md:block">
          <Seek />
        </div>
      </div>

      <div className="hidden items-center justify-end gap-3 md:flex">
        <Visualizer
          className={cn(
            "h-8 w-24 text-accent transition-opacity",
            player.playing ? "opacity-100" : "opacity-30",
          )}
        />
        <IconButton
          size="sm"
          label={player.volume === 0 ? "Unmute" : "Mute"}
          onClick={() => player.setVolume(player.volume === 0 ? 0.8 : 0)}
        >
          <VolumeIcon className="size-4" aria-hidden />
        </IconButton>
        <Slider.Root
          className="group relative flex h-4 w-24 touch-none items-center"
          min={0}
          max={1}
          step={0.01}
          value={[player.volume]}
          onValueChange={([v]) => player.setVolume(v ?? 0)}
          aria-label="Volume"
        >
          <Slider.Track className="relative h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
            <Slider.Range className="absolute h-full rounded-full bg-ink group-hover:bg-accent" />
          </Slider.Track>
          <Slider.Thumb className="block size-3 rounded-full bg-ink opacity-0 shadow-float group-hover:opacity-100 focus-visible:opacity-100" />
        </Slider.Root>
      </div>
    </section>
  );
}

export { Seek };
