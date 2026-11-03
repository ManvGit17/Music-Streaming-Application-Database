import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";
import { useSession } from "./store";
import type { Track } from "./types";

/** Data hooks. Query keys are grouped so mutations can refresh exactly what they affect. */

export const useGenres = () => useQuery({ queryKey: ["genres"], queryFn: api.genres });

export const useTrending = (genre: number | null = null, limit = 20) =>
  useQuery({ queryKey: ["trending", genre, limit], queryFn: () => api.trending({ genre, limit }) });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ["search", q],
    queryFn: () => api.search(q, 30),
    enabled: q.trim().length > 0,
    placeholderData: (prev) => prev,
  });

export const useTrack = (id: string) =>
  useQuery({ queryKey: ["track", id], queryFn: () => api.track(id) });

export const useSimilar = (id: string | undefined) =>
  useQuery({ queryKey: ["similar", id], queryFn: () => api.similar(id!, 12), enabled: !!id });

export const useTopArtists = (limit = 12) =>
  useQuery({ queryKey: ["artists", limit], queryFn: () => api.topArtists(limit) });

export const useArtist = (id: string) =>
  useQuery({ queryKey: ["artist", id], queryFn: () => api.artist(id) });

export const useAlbum = (id: string) =>
  useQuery({ queryKey: ["album", id], queryFn: () => api.album(id) });

export function useMe() {
  const session = useSession();
  return useQuery({ queryKey: ["me", session?.publicId], queryFn: api.me, enabled: !!session });
}

export function useRecommendations() {
  const session = useSession();
  return useQuery({
    queryKey: ["recommendations", session?.publicId],
    queryFn: () => api.recommendations(20),
    enabled: !!session,
  });
}

export function useLikes() {
  const session = useSession();
  return useQuery({
    queryKey: ["likes", session?.publicId],
    queryFn: api.likes,
    enabled: !!session,
  });
}

export function useHistory() {
  const session = useSession();
  return useQuery({
    queryKey: ["history", session?.publicId],
    queryFn: () => api.history(50),
    enabled: !!session,
  });
}

export function useWrapped(year: number) {
  const session = useSession();
  return useQuery({
    queryKey: ["wrapped", session?.publicId, year],
    queryFn: () => api.wrapped(year),
    enabled: !!session,
  });
}

export function useMyPlaylists() {
  const session = useSession();
  return useQuery({
    queryKey: ["playlists", "mine", session?.publicId],
    queryFn: api.myPlaylists,
    enabled: !!session,
  });
}

export const usePublicPlaylists = () =>
  useQuery({ queryKey: ["playlists", "public"], queryFn: () => api.publicPlaylists(12) });

export const usePlaylist = (id: string) =>
  useQuery({ queryKey: ["playlist", id], queryFn: () => api.playlist(id) });

export const useSchema = () =>
  useQuery({ queryKey: ["schema"], queryFn: api.schema, staleTime: Infinity });

export const useHealth = () =>
  useQuery({ queryKey: ["health"], queryFn: api.health, staleTime: Infinity });

// --- mutations ------------------------------------------------------------------------------------

/** Like or unlike, updating every cached copy of the track at once so hearts flip instantly. */
export function useToggleLike() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (track: Track) => (track.liked ? api.unlike(track.id) : api.like(track.id)),
    onMutate: (track) => {
      const flip = (t: Track) =>
        t.id === track.id
          ? { ...t, liked: !track.liked, likes: t.likes + (track.liked ? -1 : 1) }
          : t;
      client.setQueriesData({}, (data: unknown) => patchTracks(data, flip));
    },
    onError: (err, track) => {
      toast.error(`Couldn't update “${track.title}”: ${(err as Error).message}`);
      void client.invalidateQueries();
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["likes"] });
    },
  });
}

/** Walks any cached shape and applies `fn` to everything that looks like a track. */
function patchTracks(data: unknown, fn: (t: Track) => Track): unknown {
  if (Array.isArray(data)) return data.map((d) => patchTracks(d, fn));
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if ("audio_seed" in obj && "liked" in obj) return fn(obj as unknown as Track);
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const next = patchTracks(v, fn);
      if (next !== v) changed = true;
      out[k] = next;
    }
    return changed ? out : data;
  }
  return data;
}

export function useToggleFollow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, following }: { id: string; following: boolean }) =>
      following ? api.unfollow(id) : api.follow(id),
    onSuccess: (_d, { id }) => {
      void client.invalidateQueries({ queryKey: ["artist", id] });
      void client.invalidateQueries({ queryKey: ["artists"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useInvalidatePlaylists() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["playlists"] });
}
