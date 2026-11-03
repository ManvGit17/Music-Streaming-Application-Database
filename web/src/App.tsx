import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { PlayerProvider } from "./audio/player";
import { Boot } from "./components/Boot";
import { Layout } from "./components/Layout";
import { Skeleton } from "./components/ui";
import { ApiError } from "./data/types";
import { Home } from "./pages/Home";

// Heavier pages load on demand.
const SearchPage = lazy(() => import("./pages/Search"));
const ArtistPage = lazy(() => import("./pages/Artist"));
const AlbumPage = lazy(() => import("./pages/Album"));
const PlaylistPage = lazy(() => import("./pages/Playlist"));
const LibraryPage = lazy(() => import("./pages/Library"));
const WrappedPage = lazy(() => import("./pages/Wrapped"));
const AtlasPage = lazy(() => import("./pages/Atlas"));
const AdminPage = lazy(() => import("./pages/Admin"));
const SignInPage = lazy(() => import("./pages/SignIn"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

function PageFallback() {
  return (
    <div
      className="flex flex-col gap-6 pt-6"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-48 w-full rounded-3xl" />
      <Skeleton className="h-6 w-1/4" />
    </div>
  );
}

const page = (node: React.ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>;

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { index: true, element: <Home /> },
        { path: "search", element: page(<SearchPage />) },
        { path: "artist/:id", element: page(<ArtistPage />) },
        { path: "album/:id", element: page(<AlbumPage />) },
        { path: "playlist/:id", element: page(<PlaylistPage />) },
        { path: "library", element: page(<LibraryPage />) },
        { path: "wrapped", element: page(<WrappedPage />) },
        { path: "atlas", element: page(<AtlasPage />) },
        { path: "admin", element: page(<AdminPage />) },
        { path: "sign-in", element: page(<SignInPage />) },
        { path: "*", element: page(<NotFound />) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" },
);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={400}>
        <Boot>
          <PlayerProvider>
            <RouterProvider router={router} />
          </PlayerProvider>
        </Boot>
        <Toaster
          position="bottom-center"
          offset={110}
          toastOptions={{ className: "glass !bg-surface-strong !text-ink !border-line" }}
        />
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
