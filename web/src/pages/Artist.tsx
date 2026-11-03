import { BadgeCheck, Pause, Play, UserCheck, UserPlus } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { usePlayer } from "@/audio/player";
import { CollectionHeader } from "@/components/CollectionHeader";
import { Cover } from "@/components/Cover";
import { TrackList } from "@/components/music";
import { Button, ErrorState, Section, Skeleton } from "@/components/ui";
import { useArtist, useToggleFollow } from "@/data/hooks";
import { useSession } from "@/data/store";
import { count } from "@/lib/util";

export default function ArtistPage() {
  const { id = "" } = useParams();
  const artist = useArtist(id);
  const player = usePlayer();
  const follow = useToggleFollow();
  const session = useSession();
  const navigate = useNavigate();

  if (artist.isError)
    return (
      <div className="pt-6">
        <ErrorState error={artist.error} retry={() => void artist.refetch()} />
      </div>
    );
  if (!artist.data)
    return (
      <div className="flex flex-col gap-6 pt-6">
        <Skeleton className="h-72 rounded-[2rem]" />
        <Skeleton className="h-64" />
      </div>
    );

  const a = artist.data;
  const playingHere = player.current && a.top_tracks.some((t) => t.id === player.current?.id);

  return (
    <div className="flex flex-col gap-12 pt-6">
      <CollectionHeader
        round
        seed={a.hue * 7919 + a.name.length}
        hue={a.hue}
        eyebrow={a.verified ? "Verified artist" : "Artist"}
        title={
          <span className="inline-flex items-center gap-3">
            {a.name}
            {a.verified ? (
              <BadgeCheck
                className="size-8 shrink-0 text-accent md:size-10"
                aria-label="Verified"
              />
            ) : null}
          </span>
        }
        meta={
          <>
            {count(a.monthly_listeners)} monthly listeners · {count(a.followers)} followers ·{" "}
            {count(a.total_plays)} plays
            {a.country ? ` · ${a.country}` : ""}
          </>
        }
        actions={
          <>
            <Button
              variant="primary"
              size="lg"
              disabled={!a.top_tracks.length}
              onClick={() =>
                playingHere ? player.toggle() : player.play(a.top_tracks[0]!, a.top_tracks)
              }
            >
              {playingHere && player.playing ? (
                <Pause className="size-5 fill-current" aria-hidden />
              ) : (
                <Play className="size-5 fill-current" aria-hidden />
              )}
              {playingHere && player.playing ? "Pause" : "Play"}
            </Button>
            <Button
              size="lg"
              busy={follow.isPending}
              onClick={() =>
                session ? follow.mutate({ id: a.id, following: a.following }) : navigate("/sign-in")
              }
            >
              {a.following ? (
                <UserCheck className="size-4" aria-hidden />
              ) : (
                <UserPlus className="size-4" aria-hidden />
              )}
              {a.following ? "Following" : "Follow"}
            </Button>
          </>
        }
      />

      {a.bio ? <p className="max-w-2xl text-lg text-muted">{a.bio}</p> : null}

      <Section title="Popular" eyebrow="From track_stat, kept by statement-level triggers">
        <TrackList tracks={a.top_tracks} />
      </Section>

      <Section title="Discography">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {a.albums.map((al) => (
            <Link
              key={al.id}
              to={`/album/${al.id}`}
              className="group flex flex-col gap-3 rounded-2xl p-2 transition-colors hover:bg-hover"
            >
              <Cover seed={al.cover_seed} hue={a.hue} className="shadow-float" />
              <div className="min-w-0 px-1">
                <p className="truncate font-medium">{al.title}</p>
                <p className="text-sm text-muted capitalize">
                  {al.release_date?.slice(0, 4) ?? "—"} · {al.album_type}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
