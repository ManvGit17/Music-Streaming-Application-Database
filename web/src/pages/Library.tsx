import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import { Clock, Heart, ListMusic, Mic2 } from "lucide-react";
import { Link, Navigate } from "react-router";
import { usePlayer } from "@/audio/player";
import { Cover } from "@/components/Cover";
import { PlaylistCard, TrackList, TrackListSkeleton } from "@/components/music";
import { Button, EmptyState } from "@/components/ui";
import { api } from "@/data/api";
import { useHistory, useLikes, useMyPlaylists } from "@/data/hooks";
import { useSession } from "@/data/store";
import { duration } from "@/lib/util";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
  ];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit);
    value /= size;
  }
  return relative.format(Math.round(value), "year");
}

const tab =
  "flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-bg";

export default function LibraryPage() {
  const session = useSession();
  const likes = useLikes();
  const playlists = useMyPlaylists();
  const history = useHistory();
  const follows = useQuery({
    queryKey: ["follows", session?.publicId],
    queryFn: api.follows,
    enabled: !!session,
  });
  const player = usePlayer();

  if (!session) return <Navigate to="/sign-in" replace />;

  return (
    <div className="flex flex-col gap-8 pt-6">
      <header>
        <p className="eyebrow">Only you can see this: row-level security</p>
        <h1 className="text-4xl md:text-5xl">Your library</h1>
      </header>
      <Tabs.Root defaultValue="liked" className="flex flex-col gap-6">
        <Tabs.List
          aria-label="Library sections"
          className="glass flex w-fit gap-1 rounded-full p-1"
        >
          <Tabs.Trigger value="liked" className={tab}>
            <Heart className="size-4" aria-hidden /> Liked
          </Tabs.Trigger>
          <Tabs.Trigger value="playlists" className={tab}>
            <ListMusic className="size-4" aria-hidden /> Playlists
          </Tabs.Trigger>
          <Tabs.Trigger value="history" className={tab}>
            <Clock className="size-4" aria-hidden /> History
          </Tabs.Trigger>
          <Tabs.Trigger value="artists" className={tab}>
            <Mic2 className="size-4" aria-hidden /> Artists
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="liked" className="outline-none">
          {!likes.data ? (
            <TrackListSkeleton />
          ) : likes.data.length ? (
            <div className="flex flex-col gap-4">
              <Button
                variant="primary"
                className="w-fit"
                onClick={() => player.play(likes.data[0]!, likes.data)}
              >
                Play liked songs
              </Button>
              <TrackList tracks={likes.data} />
            </div>
          ) : (
            <EmptyState title="No liked songs yet" icon={<Heart className="size-8" />}>
              Tap the heart on any song. Each like updates the track's public like count through a
              statement-level trigger.
            </EmptyState>
          )}
        </Tabs.Content>

        <Tabs.Content value="playlists" className="outline-none">
          {playlists.data?.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {playlists.data.map((p) => (
                <PlaylistCard key={p.id} playlist={p} />
              ))}
            </div>
          ) : (
            <EmptyState title="No playlists yet" icon={<ListMusic className="size-8" />}>
              Use the + next to Playlists in the sidebar, or “New playlist” from any song's menu.
            </EmptyState>
          )}
        </Tabs.Content>

        <Tabs.Content value="history" className="outline-none">
          {!history.data ? (
            <TrackListSkeleton />
          ) : history.data.length ? (
            <ol className="flex flex-col">
              {history.data.map((h) => (
                <li
                  key={`${h.played_at}-${h.track.id}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-hover"
                >
                  <button
                    type="button"
                    onClick={() => player.play(h.track)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Cover
                      seed={h.track.album.cover_seed}
                      hue={h.track.genre_hue ?? h.track.artist.hue}
                      className="w-10"
                      rounded="md"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{h.track.title}</span>
                      <span className="block truncate text-sm text-muted">
                        {h.track.artist.name}
                      </span>
                    </span>
                  </button>
                  <span className="hidden text-sm text-faint sm:block">{h.device}</span>
                  <span className="w-28 text-right text-sm text-faint tabular">
                    {h.completed ? duration(h.ms_played) : `skipped at ${duration(h.ms_played)}`}
                  </span>
                  <span className="w-28 text-right text-sm text-faint">{ago(h.played_at)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Nothing played yet" icon={<Clock className="size-8" />}>
              Plays longer than five seconds are written to a monthly partition of listening_event.
            </EmptyState>
          )}
        </Tabs.Content>

        <Tabs.Content value="artists" className="outline-none">
          {follows.data?.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {follows.data.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/artist/${a.id}`}
                    className="flex flex-col items-center gap-2 rounded-2xl p-3 text-center hover:bg-hover"
                  >
                    <Cover
                      seed={a.hue * 7919 + a.name.length}
                      hue={a.hue}
                      rounded="full"
                      className="w-24"
                    />
                    <span className="truncate text-sm font-medium">{a.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Not following anyone yet" icon={<Mic2 className="size-8" />}>
              Follow artists from their pages.
            </EmptyState>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
