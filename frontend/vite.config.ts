/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// Shared with src/architecture.spec.ts's EXEMPT — one policy, one list.
import { EXEMPT_MODULES } from "./exempt-modules.ts";

// These three.js packages ship no `exports` map, and vitest resolves no
// `module` field (mainFields: []), so under test each loaded its `main` — a
// CJS or UMD build whose `require("three")` loads three's build/three.cjs,
// which prints THREE_CJS_DEPRECATED (first hit: @react-three/test-renderer's
// cjs.dev.js, line 6). Point each bare import at the ESM build its `module`
// field names — what the app bundle ships — and let Vite process it, so it
// imports three the way the app does.
const ESM_BUILDS = {
  "@react-three/fiber": "dist/react-three-fiber.esm.js",
  "@react-three/drei": "index.js",
  "@react-three/test-renderer": "dist/react-three-test-renderer.esm.js",
  maath: "dist/maath.esm.js",
  meshline: "dist/index.js",
  // drei's own nested copy (0.8), which has no `exports` map either.
  "three-mesh-bvh": "src/index.js",
  "troika-three-text": "dist/troika-three-text.esm.js",
  "troika-three-utils": "dist/troika-three-utils.esm.js",
};

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
    alias: Object.entries(ESM_BUILDS).map(([pkg, file]) => ({
      find: new RegExp(`^${pkg}$`),
      replacement: `${pkg}/${file}`,
    })),
    server: { deps: { inline: Object.keys(ESM_BUILDS) } },
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
