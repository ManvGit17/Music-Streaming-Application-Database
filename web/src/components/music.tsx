import * as Menu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Heart, ListPlus, MoreHorizontal, Pause, Play, Plus } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { usePlayer } from "@/audio/player";
import { api } from "@/data/api";
import { useMyPlaylists, useToggleLike } from "@/data/hooks";
import { useSession } from "@/data/store";
import type { Artist, PlaylistSummary, Track } from "@/data/types";
import { cn, count, duration } from "@/lib/util";
import { Cover } from "./Cover";
import { IconButton, Skeleton } from "./ui";

const hueOf = (t: Track) => t.genre_hue ?? t.artist.hue;

export function Equalizer({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-3.5 items-end gap-[2px]", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-accent"
          style={{
            animation: `eq 0.9s ${i * 0.15}s ease-in-out infinite alternate`,
            height: "40%",
          }}
        />
      ))}
      <style>{"@keyframes eq{from{height:20%}to{height:100%}}"}</style>
    </span>
  );
}

export function LikeButton({ track, size = "sm" }: { track: Track; size?: "sm" | "md" }) {
  const session = useSession();
  const navigate = useNavigate();
  const toggle = useToggleLike();
  return (
    <IconButton
      size={size}
      label={track.liked ? `Remove “${track.title}” from liked songs` : `Like “${track.title}”`}
      active={track.liked}
      onClick={(e) => {
        e.stopPropagation();
        if (!session) navigate("/sign-in");
        else toggle.mutate(track);
      }}
    >
      <Heart className={cn("size-4", track.liked && "fill-current")} aria-hidden />
    </IconButton>
  );
}

function AddToPlaylist({ track }: { track: Track }) {
  const session = useSession();
  const playlists = useMyPlaylists();
  const client = useQueryClient();
  const navigate = useNavigate();

  const add = async (p: PlaylistSummary) => {
    try {
      const before = p.track_count;
      const after = await api.addToPlaylist(p.id, track.id);
      void client.invalidateQueries({ queryKey: ["playlists"] });
      void client.invalidateQueries({ queryKey: ["playlist", p.id] });
      toast.success(after.track_count === before ? `Already in ${p.name}` : `Added to ${p.name}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const createAndAdd = async () => {
    const list = await api.createPlaylist(`${track.title} radio`, null, true);
    await add({ ...list, track_count: 0 });
    navigate(`/playlist/${list.id}`);
  };

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <IconButton
          size="sm"
          label={`More options for “${track.title}”`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </IconButton>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="glass z-50 min-w-56 rounded-xl p-1.5 shadow-float"
          onClick={(e) => e.stopPropagation()}
        >
          <Menu.Label className="eyebrow px-2.5 py-1.5">Add to playlist</Menu.Label>
          {!session ? (
            <Menu.Item className="menu-item" onSelect={() => navigate("/sign-in")}>
              Sign in to make playlists
            </Menu.Item>
          ) : (
            <>
              {(playlists.data ?? []).map((p) => (
                <Menu.Item key={p.id} className="menu-item" onSelect={() => void add(p)}>
                  <ListPlus className="size-4 text-faint" aria-hidden />
                  <span className="truncate">{p.name}</span>
                </Menu.Item>
              ))}
              <Menu.Separator className="my-1 h-px bg-line" />
              <Menu.Item className="menu-item" onSelect={() => void createAndAdd()}>
                <Plus className="size-4 text-faint" aria-hidden />
                New playlist
              </Menu.Item>
            </>
          )}
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item className="menu-item" onSelect={() => navigate(`/album/${track.album.id}`)}>
            Go to album
          </Menu.Item>
          <Menu.Item className="menu-item" onSelect={() => navigate(`/artist/${track.artist.id}`)}>
            Go to artist
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface TrackListProps {
  tracks: Track[];
  showAlbum?: boolean;
  showCover?: boolean;
  numbered?: boolean;
  /** Extra content at the end of a row, e.g. a search-rank badge or a remove button. */
  trailing?: (t: Track) => ReactNode;
}

export function TrackList({
  tracks,
  showAlbum = true,
  showCover = true,
  numbered = true,
  trailing,
}: TrackListProps) {
  const player = usePlayer();
  return (
    <ol className="flex flex-col">
      {tracks.map((t, i) => {
        const current = player.current?.id === t.id;
        return (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 12) * 0.025, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "group grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-hover md:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.2fr)_auto_auto]",
              current && "bg-accent-soft",
            )}
          >
            <button
              type="button"
              onClick={() => (current ? player.toggle() : player.play(t, tracks))}
              className="flex size-8 items-center justify-center rounded-full text-sm text-faint tabular hover:text-ink"
            >
              {/* The visible number is decoration; the button's name comes from this text. */}
              <span className="sr-only">
                {current && player.playing ? `Pause ${t.title}` : `Play ${t.title}`}
              </span>
              <span
                aria-hidden
                className={cn("group-hover:hidden group-focus-within:hidden", current && "hidden")}
              >
                {numbered ? (t.track_number && !showAlbum ? t.track_number : i + 1) : "•"}
              </span>
              {current && player.playing ? (
                <span className="group-hover:hidden">
                  <Equalizer />
                </span>
              ) : null}
              {current && player.playing ? (
                <Pause className="hidden size-4 fill-current group-hover:block" aria-hidden />
              ) : (
                <Play
                  className={cn(
                    "size-4 fill-current",
                    current ? "block" : "hidden group-hover:block group-focus-within:block",
                  )}
                  aria-hidden
                />
              )}
            </button>
            <div className="flex min-w-0 items-center gap-3">
              {showCover ? (
                <Cover seed={t.album.cover_seed} hue={hueOf(t)} className="w-10" rounded="md" />
              ) : null}
              <div className="min-w-0">
                <p className={cn("truncate font-medium", current && "text-accent")}>
                  {t.title}
                  {t.explicit ? (
                    <span
                      className="ml-2 rounded bg-hover px-1 text-[0.625rem] font-semibold text-muted"
                      title="Explicit"
                    >
                      E
                    </span>
                  ) : null}
                </p>
                <Link
                  to={`/artist/${t.artist.id}`}
                  className="truncate text-sm text-muted hover:text-ink hover:underline"
                >
                  {t.artist.name}
                </Link>
              </div>
            </div>
            {showAlbum ? (
              <Link
                to={`/album/${t.album.id}`}
                className="hidden truncate text-sm text-muted hover:text-ink hover:underline md:block"
              >
                {t.album.title}
              </Link>
            ) : (
              <span className="hidden text-sm text-faint tabular md:block">
                {count(t.plays)} plays
              </span>
            )}
            <div className="hidden items-center gap-1 md:flex">{trailing?.(t)}</div>
            <div className="flex items-center gap-1">
              <LikeButton track={t} />
              <span className="w-12 text-right text-sm text-faint tabular">
                {duration(t.duration_ms)}
              </span>
              <AddToPlaylist track={t} />
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function TrackListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={i} className="flex items-center gap-3 px-2 py-1.5">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="size-10" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- cards --------------------------------------------------------------------------------------

function PlayOverlay({
  onPlay,
  label,
  playing,
}: {
  onPlay: () => void;
  label: string;
  playing?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPlay();
      }}
      className="absolute right-3 bottom-3 flex size-12 translate-y-2 items-center justify-center rounded-full bg-accent text-on-accent opacity-0 shadow-float transition-all duration-300 ease-out-expo group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
    >
      {playing ? (
        <Pause className="size-5 fill-current" aria-hidden />
      ) : (
        <Play className="ml-0.5 size-5 fill-current" aria-hidden />
      )}
    </button>
  );
}

export function TrackCard({ track, queue }: { track: Track; queue: Track[] }) {
  const player = usePlayer();
  const current = player.current?.id === track.id;
  return (
    <Link
      to={`/album/${track.album.id}`}
      className="group flex w-44 shrink-0 flex-col gap-3 rounded-2xl p-2 transition-colors hover:bg-hover"
    >
      <div className="relative">
        <Cover
          seed={track.album.cover_seed}
          hue={hueOf(track)}
          className="shadow-float transition-transform duration-500 ease-out-expo group-hover:scale-[1.02]"
        />
        <PlayOverlay
          label={current && player.playing ? `Pause ${track.title}` : `Play ${track.title}`}
          playing={current && player.playing}
          onPlay={() => (current ? player.toggle() : player.play(track, queue))}
        />
      </div>
      <div className="min-w-0 px-1">
        <p className={cn("truncate font-medium", current && "text-accent")}>{track.title}</p>
        <p className="truncate text-sm text-muted">{track.artist.name}</p>
      </div>
    </Link>
  );
}

export function ArtistCard({
  artist,
}: {
  artist: Pick<Artist, "id" | "name" | "hue" | "monthly_listeners" | "verified">;
}) {
  return (
    <Link
      to={`/artist/${artist.id}`}
      className="group flex w-40 shrink-0 flex-col items-center gap-3 rounded-2xl p-3 text-center transition-colors hover:bg-hover"
    >
      <Cover
        seed={artist.hue * 7919 + artist.name.length}
        hue={artist.hue}
        rounded="full"
        className="w-32 shadow-float"
      />
      <div className="min-w-0">
        <p className="flex items-center justify-center gap-1 truncate font-medium">
          {artist.name}
          {artist.verified ? (
            <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Verified" />
          ) : null}
        </p>
        <p className="text-sm text-muted">{count(artist.monthly_listeners)} monthly listeners</p>
      </div>
    </Link>
  );
}

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <Link
      to={`/playlist/${playlist.id}`}
      className="group flex w-44 shrink-0 flex-col gap-3 rounded-2xl p-2 transition-colors hover:bg-hover"
    >
      <Cover
        seed={playlist.cover_seed}
        hue={((playlist.cover_seed % 360) + 360) % 360}
        className="shadow-float"
      />
      <div className="min-w-0 px-1">
        <p className="truncate font-medium">{playlist.name}</p>
        <p className="truncate text-sm text-muted">
          by {playlist.owner.display_name ?? playlist.owner.username} · {playlist.track_count}{" "}
          tracks
        </p>
      </div>
    </Link>
  );
}

export function Shelf({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="-mx-2 overflow-x-auto pb-2" aria-label={label}>
      <div className="flex gap-1 px-0">{children}</div>
    </section>
  );
}

export function ShelfSkeleton({ round = false }: { round?: boolean }) {
  return (
    <div className="flex gap-3 overflow-hidden" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={i} className="flex w-44 shrink-0 flex-col gap-3 p-2">
          <Skeleton className={cn("aspect-square w-full", round && "rounded-full")} />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
