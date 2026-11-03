import { Pause, Play } from "lucide-react";
import { Link, useParams } from "react-router";
import { usePlayer } from "@/audio/player";
import { CollectionHeader } from "@/components/CollectionHeader";
import { TrackList } from "@/components/music";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { useAlbum } from "@/data/hooks";
import { longDuration, plural } from "@/lib/util";

export default function AlbumPage() {
  const { id = "" } = useParams();
  const album = useAlbum(id);
  const player = usePlayer();

  if (album.isError)
    return (
      <div className="pt-6">
        <ErrorState error={album.error} retry={() => void album.refetch()} />
      </div>
    );
  if (!album.data)
    return (
      <div className="flex flex-col gap-6 pt-6">
        <Skeleton className="h-72 rounded-[2rem]" />
        <Skeleton className="h-64" />
      </div>
    );

  const a = album.data;
  const total = a.tracks.reduce((n, t) => n + t.duration_ms, 0);
  const hue = a.tracks[0]?.genre_hue ?? a.artist.hue;
  const playingHere = player.current?.album.id === a.id;

  return (
    <div className="flex flex-col gap-8 pt-6">
      <CollectionHeader
        seed={a.cover_seed}
        hue={hue}
        eyebrow={`${a.album_type}${a.genre ? ` · ${a.genre}` : ""}`}
        title={a.title}
        meta={
          <>
            <Link to={`/artist/${a.artist.id}`} className="font-medium text-ink hover:underline">
              {a.artist.name}
            </Link>
            {a.release_date ? ` · ${a.release_date.slice(0, 4)}` : ""} ·{" "}
            {plural(a.tracks.length, "song")}, {longDuration(total)}
            {a.label ? ` · ${a.label}` : ""}
          </>
        }
        actions={
          <Button
            variant="primary"
            size="lg"
            disabled={!a.tracks.length}
            onClick={() => (playingHere ? player.toggle() : player.play(a.tracks[0]!, a.tracks))}
          >
            {playingHere && player.playing ? (
              <Pause className="size-5 fill-current" aria-hidden />
            ) : (
              <Play className="size-5 fill-current" aria-hidden />
            )}
            {playingHere && player.playing ? "Pause" : "Play album"}
          </Button>
        }
      />
      <TrackList tracks={a.tracks} showAlbum={false} showCover={false} />
    </div>
  );
}
