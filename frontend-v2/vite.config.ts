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
    // Port 3001 so this SPA can run beside frontend/ (3000) during migration.
    port: 3001,
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
