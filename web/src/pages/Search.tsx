import { Search as SearchIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { TrackList, TrackListSkeleton } from "@/components/music";
import { Badge, EmptyState, ErrorState, Section, Skeleton } from "@/components/ui";
import { useGenres, useSearch, useTrending } from "@/data/hooks";
import { cn, plural } from "@/lib/util";

function GenreGrid({
  onPick,
  active,
}: {
  onPick: (id: number | null) => void;
  active: number | null;
}) {
  const genres = useGenres();
  if (!genres.data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {genres.data.map((g) => (
        <button
          key={g.id}
          type="button"
          aria-pressed={active === g.id}
          onClick={() => onPick(active === g.id ? null : g.id)}
          className={cn(
            "group relative h-28 overflow-hidden rounded-2xl p-4 text-left text-white shadow-float transition-transform duration-300 ease-out-expo hover:-translate-y-0.5",
            active === g.id && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
          )}
          style={{
            background: `linear-gradient(135deg, oklch(0.55 0.15 ${g.hue}), oklch(0.32 0.1 ${(g.hue + 40) % 360}))`,
          }}
        >
          <span className="relative z-10 font-display text-xl">{g.name}</span>
          <span className="relative z-10 block text-xs opacity-80">
            {plural(g.tracks, "track")}
          </span>
          <span
            aria-hidden
            className="absolute -right-6 -bottom-6 size-24 rounded-full bg-white/15 transition-transform duration-500 group-hover:scale-125"
          />
        </button>
      ))}
    </div>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const [genre, setGenre] = useState<number | null>(null);
  const results = useSearch(debounced);
  const byGenre = useTrending(genre, 30);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(q);
      setParams(q ? { q } : {}, { replace: true });
    }, 160);
    return () => window.clearTimeout(id);
  }, [q, setParams]);

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex flex-col gap-4">
        <h1 className="text-4xl md:text-5xl">Search</h1>
        <div className="glass flex h-14 items-center gap-3 rounded-2xl px-5 focus-within:ring-2 focus-within:ring-accent">
          <SearchIcon className="size-5 text-faint" aria-hidden />
          <input
            // biome-ignore lint/a11y/noAutofocus: the page exists to type a search
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try “midnite tran”: typos and partial words work"
            aria-label="Search songs, artists and albums"
            className="h-full flex-1 bg-transparent text-lg outline-none placeholder:text-faint"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="text-faint hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          Two rankings fused with Reciprocal Rank Fusion: prefix full-text search and strict trigram
          similarity, both on accent-folded text. Each result shows which one found it.
        </p>
      </header>

      {debounced ? (
        results.isError ? (
          <ErrorState error={results.error} retry={() => void results.refetch()} />
        ) : results.data ? (
          results.data.length ? (
            <Section title={`Results for “${debounced}”`}>
              <TrackList
                tracks={results.data}
                trailing={(t) => {
                  const hit = results.data.find((r) => r.id === t.id);
                  return (
                    <>
                      {hit?.lexical_rank ? (
                        <Badge tone="accent">text #{hit.lexical_rank}</Badge>
                      ) : null}
                      {hit?.fuzzy_rank ? <Badge>fuzzy #{hit.fuzzy_rank}</Badge> : null}
                    </>
                  );
                }}
              />
            </Section>
          ) : (
            <EmptyState title="Nothing matched" icon={<SearchIcon className="size-8" />}>
              Not even a fuzzy match for “{debounced}”. Try fewer words, or browse a genre below.
            </EmptyState>
          )
        ) : (
          <TrackListSkeleton />
        )
      ) : null}

      <Section title="Browse by genre">
        <GenreGrid onPick={setGenre} active={genre} />
      </Section>

      {genre !== null ? (
        <Section title="Trending in this genre">
          {byGenre.data ? <TrackList tracks={byGenre.data} /> : <TrackListSkeleton />}
        </Section>
      ) : null}
    </div>
  );
}
