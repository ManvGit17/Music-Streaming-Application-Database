import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Database, Play, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { usePlayer } from "@/audio/player";
import {
  ArtistCard,
  PlaylistCard,
  Shelf,
  ShelfSkeleton,
  TrackCard,
  TrackList,
  TrackListSkeleton,
} from "@/components/music";
import { Button, ErrorState, Section } from "@/components/ui";
import { api } from "@/data/api";
import {
  useGenres,
  useHistory,
  useMe,
  usePublicPlaylists,
  useRecommendations,
  useTopArtists,
  useTrending,
} from "@/data/hooks";
import { lens, useSession } from "@/data/store";
import { cn, greeting } from "@/lib/util";

function Hero() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const tryIt = async () => {
    setBusy(true);
    try {
      await api.login("john_doe", "vamusic");
      await client.invalidateQueries();
      toast.success("Signed in as john_doe, a sample listener");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="glass relative overflow-hidden rounded-[2rem] p-8 md:p-12"
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 size-96 rounded-full bg-accent opacity-25 blur-3xl"
      />
      <div className="relative flex max-w-2xl flex-col gap-5">
        <p className="eyebrow flex items-center gap-2">
          <Database className="size-3.5" aria-hidden />
          {api.mode === "browser"
            ? "PostgreSQL 18 is running in this tab"
            : "Live on PostgreSQL 18"}
        </p>
        <h1 className="text-5xl leading-[1.05] md:text-7xl">
          Music, with the
          <br />
          <em className="text-accent">database showing.</em>
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Every song plays, every click is real SQL, and the SQL Lens shows you the queries, plans
          and triggers behind each one: partitions, row-level security, vector search, the lot.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" size="lg" busy={busy} onClick={() => void tryIt()}>
            Explore as a listener <ArrowRight className="size-4" aria-hidden />
          </Button>
          <Button size="lg" onClick={() => lens.toggle(true)}>
            <Database className="size-4" aria-hidden /> Open the SQL Lens
          </Button>
          <Button variant="ghost" size="lg" onClick={() => navigate("/atlas")}>
            See the schema
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

function Trending() {
  const genres = useGenres();
  const [genre, setGenre] = useState<number | null>(null);
  const trending = useTrending(genre, 10);
  const player = usePlayer();
  return (
    <Section
      eyebrow="Time-decayed, refreshed concurrently"
      title="Trending now"
      action={
        trending.data?.length ? (
          <Button size="sm" onClick={() => player.play(trending.data[0]!, trending.data)}>
            <Play className="size-3.5 fill-current" aria-hidden /> Play all
          </Button>
        ) : null
      }
    >
      <fieldset className="m-0 -mx-1 flex min-w-0 gap-2 overflow-x-auto border-0 px-1 pb-1">
        <legend className="sr-only">Filter by genre</legend>
        {[
          { id: null as number | null, name: "Everything" },
          ...(genres.data ?? []).slice(0, 12),
        ].map((g) => (
          <button
            key={g.name}
            type="button"
            aria-pressed={genre === g.id}
            onClick={() => setGenre(g.id)}
            className={cn(
              "h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
              genre === g.id ? "bg-ink text-bg" : "glass text-muted hover:text-ink",
            )}
          >
            {g.name}
          </button>
        ))}
      </fieldset>
      {trending.isError ? (
        <ErrorState error={trending.error} retry={() => void trending.refetch()} />
      ) : trending.data ? (
        <TrackList tracks={trending.data} />
      ) : (
        <TrackListSkeleton rows={10} />
      )}
    </Section>
  );
}

export function Home() {
  const session = useSession();
  const me = useMe();
  const recs = useRecommendations();
  const history = useHistory();
  const artists = useTopArtists(12);
  const playlists = usePublicPlaylists();
  const name = me.data?.display_name?.split(" ")[0] ?? session?.displayName?.split(" ")[0];

  const recent = history.data
    ? [...new Map(history.data.map((p) => [p.track.id, p.track])).values()].slice(0, 12)
    : [];

  return (
    <div className="flex flex-col gap-12 pt-6">
      {session ? (
        <header>
          <p className="eyebrow">
            {me.data ? `${me.data.tier} · ${me.data.plan ?? "Free"} plan` : " "}
          </p>
          <h1 className="text-4xl md:text-6xl">
            {greeting()}
            {name ? `, ${name}` : ""}.
          </h1>
        </header>
      ) : (
        <Hero />
      )}

      {session ? (
        <Section
          eyebrow="A taste vector and an HNSW index"
          title="Made for you"
          action={
            <Link
              aria-label="Your year in music"
              to="/wrapped"
              className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
            >
              <Sparkles className="size-4" aria-hidden />
              <span className="hidden sm:inline">Your year</span>
            </Link>
          }
        >
          {recs.data ? (
            <Shelf label="Recommended tracks">
              {recs.data.slice(0, 12).map((t) => (
                <TrackCard key={t.id} track={t} queue={recs.data} />
              ))}
            </Shelf>
          ) : recs.isError ? (
            <ErrorState error={recs.error} retry={() => void recs.refetch()} />
          ) : (
            <ShelfSkeleton />
          )}
        </Section>
      ) : null}

      {session && recent.length ? (
        <Section title="Jump back in" eyebrow="Your listening history">
          <Shelf label="Recently played">
            {recent.map((t) => (
              <TrackCard key={t.id} track={t} queue={recent} />
            ))}
          </Shelf>
        </Section>
      ) : null}

      <Trending />

      <Section title="Artists people are hearing" eyebrow="Distinct listeners, last 28 days">
        {artists.data ? (
          <Shelf label="Top artists">
            {artists.data.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </Shelf>
        ) : (
          <ShelfSkeleton round />
        )}
      </Section>

      <Section title="Playlists from listeners" eyebrow="Public playlists, by followers">
        {playlists.data ? (
          <Shelf label="Public playlists">
            {playlists.data.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </Shelf>
        ) : (
          <ShelfSkeleton />
        )}
      </Section>
    </div>
  );
}
