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
    // Port 3000, not Vite's 5173: PASSKEY_RP_ORIGINS is pinned to
    // http://localhost:3000, and a mismatched origin fails every WebAuthn
    // ceremony with an opaque client-side SecurityError and no server log.
    port: 3000,
    // /api is proxied by DEFAULT so dev matches production's topology, where
    // nginx serves the SPA and proxies /api to the gateway. Same origin is what
    // lets the session cookie ride on <img>, <iframe> (pdf.js) and EventSource
    // without withCredentials anywhere — and it removes the class of bug this
    // repo already hit once, where dev and prod differed and prod silently
    // built against undefined/api/…
    //
    // VITE_DEV_PROXY overrides the target, e.g. to run the SPA against prod.
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_PROXY ?? "http://localhost:8080",
        changeOrigin: true,
        secure: true,
      },
    },
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
