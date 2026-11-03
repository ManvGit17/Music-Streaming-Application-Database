import * as Menu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Home,
  Library,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { usePlayer } from "@/audio/player";
import { api } from "@/data/api";
import { useMyPlaylists } from "@/data/hooks";
import { lens, sessionStore, setTheme, useLens, useSession, useTheme } from "@/data/store";
import { LensDrawer } from "@/lens/LensDrawer";
import { cn } from "@/lib/util";
import { CommandPalette } from "./CommandPalette";
import { Cover } from "./Cover";
import { NowPlaying } from "./NowPlaying";
import { PlayerBar } from "./PlayerBar";
import { IconButton } from "./ui";

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-3 py-2" aria-label="VaMusic home">
      <svg viewBox="0 0 32 32" className="size-8 text-accent" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="currentColor" opacity="0.15" />
        <path
          d="M9 10l7 13 7-13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="16"
          cy="16"
          r="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.6"
        />
      </svg>
      <span className="font-display text-2xl tracking-tight">VaMusic</span>
    </Link>
  );
}

function NavItem({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: typeof Home;
  children: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive ? "bg-hover text-ink" : "text-muted hover:bg-hover hover:text-ink",
        )
      }
    >
      <Icon className="size-[1.125rem]" aria-hidden />
      {children}
    </NavLink>
  );
}

function Sidebar() {
  const session = useSession();
  const playlists = useMyPlaylists();
  const navigate = useNavigate();
  const client = useQueryClient();

  const create = async () => {
    if (!session) return navigate("/sign-in");
    try {
      const list = await api.createPlaylist(`Playlist #${(playlists.data?.length ?? 0) + 1}`);
      void client.invalidateQueries({ queryKey: ["playlists"] });
      navigate(`/playlist/${list.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <nav
      aria-label="Main"
      className="glass hidden w-64 shrink-0 flex-col gap-6 rounded-3xl p-3 lg:flex"
    >
      <Wordmark />
      <div className="flex flex-col gap-0.5">
        <NavItem to="/" icon={Home}>
          Home
        </NavItem>
        <NavItem to="/search" icon={Search}>
          Search
        </NavItem>
        <NavItem to="/library" icon={Library}>
          Your library
        </NavItem>
        <NavItem to="/wrapped" icon={Sparkles}>
          Your year
        </NavItem>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="eyebrow px-3 pb-1">Under the hood</p>
        <NavItem to="/atlas" icon={Network}>
          Schema Atlas
        </NavItem>
        {session?.role === "admin" ? (
          <NavItem to="/admin" icon={ShieldCheck}>
            Admin
          </NavItem>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pb-1">
          <p className="eyebrow">Playlists</p>
          <IconButton size="sm" label="Create a playlist" onClick={() => void create()}>
            <Plus className="size-4" aria-hidden />
          </IconButton>
        </div>
        <ul className="-mx-1 flex-1 overflow-y-auto px-1">
          {(playlists.data ?? []).map((p) => (
            <li key={p.id}>
              <NavLink
                to={`/playlist/${p.id}`}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl p-1.5 text-sm transition-colors hover:bg-hover",
                    isActive && "bg-hover",
                  )
                }
              >
                <Cover
                  seed={p.cover_seed}
                  hue={((p.cover_seed % 360) + 360) % 360}
                  className="w-9"
                  rounded="md"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-xs text-faint">{p.track_count} tracks</span>
                </span>
              </NavLink>
            </li>
          ))}
          {!session ? (
            <li className="px-3 py-2 text-xs text-faint">
              <Link to="/sign-in" className="text-accent hover:underline">
                Sign in
              </Link>{" "}
              to see your playlists.
            </li>
          ) : null}
        </ul>
      </div>
    </nav>
  );
}

function ThemeMenu() {
  const theme = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <IconButton label={`Theme: ${theme}`}>
          <Icon className="size-[1.125rem]" aria-hidden />
        </IconButton>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="glass z-50 min-w-40 rounded-xl bg-surface-strong p-1.5 shadow-float"
        >
          <Menu.RadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v as "system" | "light" | "dark")}
          >
            {(["system", "light", "dark"] as const).map((t) => (
              <Menu.RadioItem key={t} value={t} className="menu-item capitalize">
                <Menu.ItemIndicator className="absolute right-2 text-accent">•</Menu.ItemIndicator>
                {t}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function AccountMenu() {
  const session = useSession();
  const navigate = useNavigate();
  const client = useQueryClient();
  if (!session) {
    return (
      <Link
        to="/sign-in"
        className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-bg transition hover:opacity-90"
      >
        <LogIn className="size-4" aria-hidden /> Sign in
      </Link>
    );
  }
  const name = session.displayName ?? session.username;
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button
          type="button"
          aria-label={`Account: ${name}`}
          className="flex size-10 items-center justify-center rounded-full bg-accent font-display text-lg text-on-accent shadow-float"
        >
          {name.slice(0, 1).toUpperCase()}
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="glass z-50 min-w-56 rounded-xl bg-surface-strong p-1.5 shadow-float"
        >
          <div className="px-2.5 py-2">
            <p className="font-medium">{name}</p>
            <p className="text-xs text-faint">
              @{session.username} · {session.role}
            </p>
          </div>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item className="menu-item" onSelect={() => navigate("/library")}>
            Your library
          </Menu.Item>
          <Menu.Item className="menu-item" onSelect={() => navigate("/wrapped")}>
            Your year in music
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item
            className="menu-item"
            onSelect={() => {
              sessionStore.set(null);
              client.clear();
              navigate("/");
            }}
          >
            <LogOut className="size-4 text-faint" aria-hidden /> Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const navigate = useNavigate();
  const { open, entries } = useLens();
  const last = entries[0];
  return (
    <header className="flex items-center gap-2">
      <div className="hidden gap-1 md:flex">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft className="size-5" aria-hidden />
        </IconButton>
        <IconButton label="Forward" onClick={() => navigate(1)}>
          <ChevronRight className="size-5" aria-hidden />
        </IconButton>
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="glass flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full px-4 text-left text-sm text-faint transition-colors hover:text-muted md:max-w-md"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">What do you want to hear?</span>
        <kbd className="ml-auto hidden rounded-md border border-line px-1.5 py-0.5 text-xs md:inline">
          ⌘K
        </kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => lens.toggle()}
          aria-pressed={open}
          className={cn(
            "flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
            open ? "bg-accent text-on-accent" : "glass text-muted hover:text-ink",
          )}
        >
          <Database className="size-4" aria-hidden />
          <span className="hidden sm:inline">SQL Lens</span>
          {open && last ? (
            <span className="tabular opacity-80">{last.trace.total_ms.toFixed(0)} ms</span>
          ) : null}
        </button>
        <ThemeMenu />
        <AccountMenu />
      </div>
    </header>
  );
}

function MobileNav() {
  return (
    <nav aria-label="Main" className="glass grid grid-cols-4 rounded-3xl p-1 lg:hidden">
      {[
        { to: "/", icon: Home, label: "Home" },
        { to: "/search", icon: Search, label: "Search" },
        { to: "/library", icon: Library, label: "Library" },
        { to: "/atlas", icon: Network, label: "Atlas" },
      ].map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[0.6875rem] font-medium",
              isActive ? "text-accent" : "text-muted",
            )
          }
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(false);
  const player = usePlayer();
  const { open: lensOpen } = useLens();
  const client = useQueryClient();
  const location = useLocation();

  // Opening the lens re-runs what's on screen, so its queries show up with their plans.
  useEffect(() => {
    if (lensOpen) void client.invalidateQueries({ type: "active" });
  }, [lensOpen, client]);

  // Scroll to the top on navigation; the main column is its own scroll container.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change
  useEffect(() => {
    document.getElementById("main")?.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === " " && target.tagName !== "BUTTON" && player.current) {
        e.preventDefault();
        player.toggle();
      } else if (e.key.toLowerCase() === "l") {
        lens.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  return (
    <div className="relative z-10 flex h-full flex-col gap-3 p-3">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>
      <div className="flex min-h-0 flex-1 gap-3">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TopBar onSearch={() => setPaletteOpen(true)} />
          <main
            id="main"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto rounded-3xl outline-none"
          >
            <div
              className={cn(
                "mx-auto max-w-6xl px-1 pb-10 transition-[padding] md:px-4",
                lensOpen && "xl:pr-[31rem]",
              )}
            >
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <PlayerBar onExpand={() => setNowPlaying(true)} />
      <MobileNav />
      <LensDrawer />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <NowPlaying open={nowPlaying} onOpenChange={setNowPlaying} />
    </div>
  );
}
