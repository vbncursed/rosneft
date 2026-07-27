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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // vitest (mode "test") does not load .env.development, so give the client a
    // defined base URL for tests. Real dev/prod read it from .env.* / the build.
    env: { VITE_API_URL: "http://localhost:8080" },
  },
});
