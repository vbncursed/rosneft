/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// Shared with src/architecture.spec.ts's EXEMPT — one policy, one list.
import { EXEMPT_MODULES } from "./exempt-modules.ts";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    // 3000 is the origin the gateway's PASSKEY_RP_ORIGINS lists for local
    // dev. strictPort: a busy port must fail loudly — Vite's silent move to
    // 3001 would leave every passkey ceremony failing with no server log.
    port: 3000,
    strictPort: true,
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
    globals: true,
    // vitest (mode "test") loads no .env.* file, so shared/api/client.ts's
    // `${API_BASE}${path}` would fetch "undefined/api/...". Empty string
    // matches the real dev/prod value — this SPA is single-origin by design.
    env: { VITE_API_URL: "" },
    setupFiles: ["./src/shared/lib/test-setup.ts"],
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // The modules architecture.spec.ts excuses from needing a spec, plus
      // the files that are specs or sample data themselves.
      exclude: [
        ...EXEMPT_MODULES,
        "src/**/*.fixture.tsx",
        "src/**/index.ts",
        "src/architecture.spec.ts",
      ],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
