/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // GitHub Pages serves the demo from /<repo>/; set VITE_BASE there.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": here("./src"),
      // The app imports the real migrations and shared queries from the repository's db/ folder.
      "@db": here("../db"),
    },
  },
  server: { fs: { allow: [".."] } },
  worker: { format: "es" },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
  },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
