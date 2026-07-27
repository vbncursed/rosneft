// assetUrl returns the public URL for a converted binary artifact. Absolute
// (VITE_API_URL) because the SPA has no same-origin BFF — the request must hit
// the gateway directly. /api/assets/* is unauthenticated (Ф0) and under the
// gateway's root CORS, so no token and cross-origin GET both work (three.js
// GLTFLoader + <img> thumbnails).
export function assetUrl(hash: string): string {
  return `${import.meta.env.VITE_API_URL}/api/assets/${encodeURIComponent(hash)}`;
}
