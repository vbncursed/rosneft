import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output bundles a minimal node_modules into .next/standalone
  // so the production Docker image only needs the standalone tree.
  output: "standalone",

  // Tree-shake barrel imports for these libraries (drei re-exports 100+).
  experimental: {
    optimizePackageImports: ["@react-three/drei", "three-stdlib"],
  },

  // Note: /api/* is no longer a rewrite — the BFF Route Handler at
  // src/app/api/[...path]/route.ts proxies it and injects the session Bearer.
  // SSE + binary assets connect to NEXT_PUBLIC_API_URL directly (public,
  // unauthenticated endpoints) so they bypass the proxy.
};

export default nextConfig;
