import type { NextConfig } from "next";

const gatewayUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
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
      { source: "/api/:path*", destination: `${gatewayUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;
