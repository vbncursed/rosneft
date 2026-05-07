import type { NextConfig } from "next";

// Server-side rewrite target. Resolved at runtime inside rewrites() so
// the standalone build doesn't bake the build-time env value into the
// bundle. NEXT_PUBLIC_API_URL is the browser-side URL and stays
// separate because EventSource for SSE has to bypass the Node proxy
// that buffers stream frames.
function gatewayUrl(): string {
  return (
    process.env.GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080"
  );
}

const nextConfig: NextConfig = {
  // standalone output bundles a minimal node_modules into .next/standalone
  // so the production Docker image only needs the standalone tree + the
  // static assets — no full node_modules copy. Image size drops from
  // ~700MB to ~200MB.
  output: "standalone",

  // Tree-shake barrel imports for these libraries — drei in particular
  // re-exports 100+ components from a single index, so a one-symbol
  // import would otherwise pull a chunk of unused features.
  experimental: {
    optimizePackageImports: ["@react-three/drei", "three-stdlib"],
  },

  // Proxy /api/* to the gateway in dev so client-side fetches stay same-origin
  // and avoid CORS preflight. Server-side fetches use the absolute URL from
  // NEXT_PUBLIC_API_URL directly (see src/shared/infrastructure/http/client.ts).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${gatewayUrl()}/api/:path*` },
    ];
  },
};

export default nextConfig;
