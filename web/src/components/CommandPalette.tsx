import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Database, Disc3, Home, Library, Moon, Network, Search, Sparkles, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { usePlayer } from "@/audio/player";
import { useSearch } from "@/data/hooks";
import { lens, setTheme, useTheme } from "@/data/store";
import { Cover } from "./Cover";
import { Badge } from "./ui";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** ⌘K: hybrid search as you type, plus quick navigation. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 140);
  const results = useSearch(debounced);
  const navigate = useNavigate();
  const player = usePlayer();
  const theme = useTheme();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="glass fixed top-[12vh] left-1/2 z-50 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-3xl bg-surface-strong shadow-float"
        >
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <Command shouldFilter={false} label="Search and commands" loop>
            <div className="flex items-center gap-3 border-b border-line px-5">
              <Search className="size-5 text-faint" aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search songs, artists, albums… typos welcome"
                className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-xs text-faint">
                esc
              </kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted">
                {q ? "No matches, even with fuzzy matching." : "Start typing to search."}
              </Command.Empty>
              {q && results.data?.length ? (
                <Command.Group heading="Songs" className="palette-group">
                  {results.data.slice(0, 8).map((t) => (
                    <Command.Item
                      key={t.id}
                      value={t.id}
                      onSelect={() => {
                        player.play(t, results.data);
                        onOpenChange(false);
                      }}
                      className="palette-item"
                    >
                      <Cover
                        seed={t.album.cover_seed}
                        hue={t.genre_hue ?? t.artist.hue}
                        className="w-9"
                        rounded="md"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{t.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {t.artist.name} · {t.album.title}
                        </span>
                      </span>
                      <span className="flex gap-1">
                        {t.lexical_rank ? (
                          <Badge tone="accent">text #{t.lexical_rank}</Badge>
                        ) : null}
                        {t.fuzzy_rank ? <Badge>fuzzy #{t.fuzzy_rank}</Badge> : null}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {!q ? (
                <Command.Group heading="Go to" className="palette-group">
                  <Command.Item className="palette-item" onSelect={() => go("/")}>
                    <Home className="size-4 text-faint" aria-hidden /> Home
                  </Command.Item>
                  <Command.Item className="palette-item" onSelect={() => go("/library")}>
                    <Library className="size-4 text-faint" aria-hidden /> Your library
                  </Command.Item>
                  <Command.Item className="palette-item" onSelect={() => go("/wrapped")}>
                    <Sparkles className="size-4 text-faint" aria-hidden /> Your year in music
                  </Command.Item>
                  <Command.Item className="palette-item" onSelect={() => go("/atlas")}>
                    <Network className="size-4 text-faint" aria-hidden /> Schema Atlas
                  </Command.Item>
                  <Command.Item className="palette-item" onSelect={() => go("/search")}>
                    <Disc3 className="size-4 text-faint" aria-hidden /> Browse genres
                  </Command.Item>
                  <Command.Item
                    className="palette-item"
                    onSelect={() => {
                      lens.toggle();
                      onOpenChange(false);
                    }}
                  >
                    <Database className="size-4 text-faint" aria-hidden /> Toggle the SQL Lens
                  </Command.Item>
                  <Command.Item
                    className="palette-item"
                    onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    {theme === "dark" ? (
                      <Sun className="size-4 text-faint" aria-hidden />
                    ) : (
                      <Moon className="size-4 text-faint" aria-hidden />
                    )}
                    Switch to {theme === "dark" ? "light" : "dark"} mode
                  </Command.Item>
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
