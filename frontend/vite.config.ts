/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    // Dev-only: set VITE_DEV_PROXY=<gateway-url> to route /api through Vite to a
    // remote gateway (e.g. prod) so the SPA runs against real data WITHOUT
    // touching that gateway's CORS. Pair with VITE_API_URL= (empty) so the app
    // makes same-origin /api requests. Off by default.
    proxy: process.env.VITE_DEV_PROXY
      ? { "/api": { target: process.env.VITE_DEV_PROXY, changeOrigin: true, secure: true } }
      : undefined,
  },
  test: {
    environment: "jsdom",
    // SPA/vitest tests use *.spec.ts(x); legacy node:test files keep *.test.ts
    // and run via `yarn test` (node --test). Two runners, no glob collision.
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    // vitest (mode "test") does not load .env.development, so give the client a
    // defined base URL for tests. Real dev/prod read it from .env.* / the build.
    env: { VITE_API_URL: "http://localhost:8080" },
  },
});
