/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: { port: 5173 },
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
