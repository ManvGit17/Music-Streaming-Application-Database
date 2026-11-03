import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, GripVertical, Lock, Pause, Play, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { usePlayer } from "@/audio/player";
import { CollectionHeader } from "@/components/CollectionHeader";
import { Cover } from "@/components/Cover";
import { LikeButton, TrackList } from "@/components/music";
import { Button, EmptyState, ErrorState, IconButton, Skeleton } from "@/components/ui";
import { api } from "@/data/api";
import { usePlaylist } from "@/data/hooks";
import { useSession } from "@/data/store";
import type { Playlist, Track } from "@/data/types";
import { duration, longDuration, plural } from "@/lib/util";

function SortableRow({
  track,
  index,
  onRemove,
}: {
  track: Track;
  index: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });
  const player = usePlayer();
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group grid grid-cols-[2rem_2rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-hover ${isDragging ? "z-10 bg-surface-strong shadow-float" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${track.title}. Use arrow keys to reorder.`}
        className="flex size-8 cursor-grab items-center justify-center rounded-full text-faint hover:text-ink active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <span className="text-center text-sm text-faint tabular">{index + 1}</span>
      <button
        type="button"
        onClick={() => player.play(track)}
        className="flex min-w-0 items-center gap-3 text-left"
      >
        <Cover
          seed={track.album.cover_seed}
          hue={track.genre_hue ?? track.artist.hue}
          className="w-10"
          rounded="md"
        />
        <span className="min-w-0">
          <span className="block truncate font-medium">{track.title}</span>
          <span className="block truncate text-sm text-muted">{track.artist.name}</span>
        </span>
      </button>
      <span className="flex items-center gap-1">
        <LikeButton track={track} />
        <span className="w-12 text-right text-sm text-faint tabular">
          {duration(track.duration_ms)}
        </span>
        <IconButton size="sm" label={`Remove ${track.title} from this playlist`} onClick={onRemove}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </span>
    </li>
  );
}

function OwnerTracks({ playlist }: { playlist: Playlist }) {
  const client = useQueryClient();
  const [order, setOrder] = useState(playlist.tracks);
  useEffect(() => setOrder(playlist.tracks), [playlist.tracks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = (next: Playlist) => client.setQueryData(["playlist", playlist.id], next);

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.findIndex((t) => t.id === active.id);
    const to = order.findIndex((t) => t.id === over.id);
    const next = arrayMove(order, from, to);
    setOrder(next);
    try {
      save(
        await api.reorderPlaylist(
          playlist.id,
          next.map((t) => t.id),
        ),
      );
    } catch (err) {
      setOrder(order);
      toast.error((err as Error).message);
    }
  };

  const remove = async (track: Track) => {
    try {
      save(await api.removeFromPlaylist(playlist.id, track.id));
      void client.invalidateQueries({ queryKey: ["playlists"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => void onDragEnd(e)}
    >
      <SortableContext items={order.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col">
          {order.map((t, i) => (
            <SortableRow key={t.id} track={t} index={i} onRemove={() => void remove(t)} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function EditableTitle({ playlist }: { playlist: Playlist }) {
  const client = useQueryClient();
  const [value, setValue] = useState(playlist.name);
  useEffect(() => setValue(playlist.name), [playlist.name]);
  const commit = async () => {
    const name = value.trim();
    if (!name || name === playlist.name) return setValue(playlist.name);
    try {
      client.setQueryData(
        ["playlist", playlist.id],
        await api.updatePlaylist(playlist.id, { name }),
      );
      void client.invalidateQueries({ queryKey: ["playlists"] });
    } catch (err) {
      setValue(playlist.name);
      toast.error((err as Error).message);
    }
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label="Playlist name"
      maxLength={100}
      className="w-full rounded-xl bg-transparent font-display outline-none hover:bg-hover focus:bg-hover"
    />
  );
}

export default function PlaylistPage() {
  const { id = "" } = useParams();
  const playlist = usePlaylist(id);
  const player = usePlayer();
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (playlist.isError) {
    return (
      <div className="pt-6">
        <ErrorState error={playlist.error} />
        <p className="mt-3 text-sm text-muted">
          Private playlists are invisible to everyone but their owner: row-level security filters
          them out before the query even sees them.
        </p>
      </div>
    );
  }
  if (!playlist.data)
    return (
      <div className="flex flex-col gap-6 pt-6">
        <Skeleton className="h-72 rounded-[2rem]" />
        <Skeleton className="h-64" />
      </div>
    );

  const p = playlist.data;
  const hue = ((p.cover_seed % 360) + 360) % 360;
  const playingHere = player.current && p.tracks.some((t) => t.id === player.current?.id);

  const act = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await fn();
      void client.invalidateQueries({ queryKey: ["playlists"] });
      void client.invalidateQueries({ queryKey: ["playlist", p.id] });
      if (message) toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 pt-6">
      <CollectionHeader
        seed={p.cover_seed}
        hue={hue}
        eyebrow={p.is_public ? "Public playlist" : "Private playlist"}
        title={p.is_owner ? <EditableTitle playlist={p} /> : p.name}
        meta={
          <>
            by{" "}
            <span className="font-medium text-ink">{p.owner.display_name ?? p.owner.username}</span>{" "}
            · {plural(p.track_count, "song")}, {longDuration(p.duration_ms)} ·{" "}
            {plural(p.followers, "follower")}
          </>
        }
        actions={
          <>
            <Button
              variant="primary"
              size="lg"
              disabled={!p.tracks.length}
              onClick={() => (playingHere ? player.toggle() : player.play(p.tracks[0]!, p.tracks))}
            >
              {playingHere && player.playing ? (
                <Pause className="size-5 fill-current" aria-hidden />
              ) : (
                <Play className="size-5 fill-current" aria-hidden />
              )}
              {playingHere && player.playing ? "Pause" : "Play"}
            </Button>
            {p.is_owner ? (
              <>
                <Button
                  busy={busy}
                  onClick={() =>
                    void act(
                      () => api.updatePlaylist(p.id, { is_public: !p.is_public }),
                      p.is_public ? "Now private: only you can see it" : "Now public",
                    )
                  }
                >
                  {p.is_public ? (
                    <Lock className="size-4" aria-hidden />
                  ) : (
                    <Globe className="size-4" aria-hidden />
                  )}
                  Make {p.is_public ? "private" : "public"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Delete “${p.name}”?`)) {
                      void act(() => api.deletePlaylist(p.id), "Playlist deleted").then(() =>
                        navigate("/library"),
                      );
                    }
                  }}
                >
                  <Trash2 className="size-4" aria-hidden /> Delete
                </Button>
              </>
            ) : session ? (
              <Button
                busy={busy}
                onClick={() => void act(() => api.followPlaylist(p.id), `Following ${p.name}`)}
              >
                Follow
              </Button>
            ) : null}
          </>
        }
      />

      {p.tracks.length === 0 ? (
        <EmptyState
          title="This playlist is empty"
          icon={<Search className="size-8" />}
          action={
            <Link to="/search" className="text-sm font-medium text-accent hover:underline">
              Find something to add
            </Link>
          }
        >
          Add songs from any track's menu. Adding the same song twice is a no-op: the function
          behind it uses ON CONFLICT DO NOTHING.
        </EmptyState>
      ) : p.is_owner ? (
        <>
          <p className="text-sm text-muted">
            Drag to reorder. The new order is saved in one UPDATE: a deferrable unique constraint
            lets positions pass through duplicates mid-statement.
          </p>
          <OwnerTracks playlist={p} />
        </>
      ) : (
        <TrackList tracks={p.tracks} />
      )}
    </div>
  );
}
