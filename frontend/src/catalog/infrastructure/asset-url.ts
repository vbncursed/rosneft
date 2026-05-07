// assetUrl returns the public URL clients should hit to download a converted
// binary artifact. Always relative so it goes through the gateway (and its
// proxy to asset-service) rather than hitting asset-service directly.
export function assetUrl(hash: string): string {
  return `/api/assets/${encodeURIComponent(hash)}`;
}
