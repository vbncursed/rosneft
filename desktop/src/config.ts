/** Production, unless DESKTOP_UPSTREAM points the shell at something else (a local Vite on :3000). */
export const DEFAULT_UPSTREAM = "https://andrey.vbncursed.fun";

export function upstreamOrigin(env: Record<string, string | undefined>): string {
  const raw = env.DESKTOP_UPSTREAM || DEFAULT_UPSTREAM;
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`DESKTOP_UPSTREAM must be an http(s) URL, got ${raw}`);
  }
  return url.origin;
}
