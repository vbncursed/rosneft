// assetUrl returns the URL for a converted binary artifact. Relative in both dev
// and prod: nginx serves the SPA and proxies /api in production, Vite does the
// same in dev, so the SPA is single-origin with the API. That is what lets the
// httpOnly session cookie ride on three.js loader requests, <img> thumbnails and
// the pdf.js <iframe> — /api/assets/* requires a session and none of those can
// carry an Authorization header.
export function assetUrl(hash: string): string {
  return `${import.meta.env.VITE_API_URL}/api/assets/${encodeURIComponent(hash)}`;
}
