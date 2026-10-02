export type Route =
  | { kind: "navigate" }
  | { kind: "shell"; path: string }
  | { kind: "snapshot"; key: string }
  | { kind: "blob"; hash: string }
  | { kind: "session-reset" }
  | { kind: "pass" };

// Every step that hands out a new session cookie (the list nginx rate-limits in
// ops/nginx/rosneft.conf) plus logout: past any of them the cache owner is unknown.
const SESSION_RESET = /^\/api\/auth\/(login(\/2fa)?|passkey\/login\/(begin|finish)|logout)$/u;

// What the SPA needs to boot and open a territory with no network. Nothing with a
// query: the key would include it and nothing ever sweeps snapshots/.
const SNAPSHOT = [
  /^\/api\/auth\/me$/u,
  /^\/api\/territories$/u,
  /^\/api\/territories\/[a-z0-9-]+$/u,
  /^\/api\/territories\/[a-z0-9-]+\/scene$/u,
  /^\/api\/models$/u,
  // The catalog and Home both wait on it; offline they show the last known conversion states.
  /^\/api\/jobs$/u,
];

const BLOB = /^\/api\/assets\/([0-9a-f]{64})$/u;

export function classify(method: string, url: URL): Route {
  const path = url.pathname;
  if (path === "/api" || path.startsWith("/api/")) {
    if (method === "POST" && SESSION_RESET.test(path)) return { kind: "session-reset" };
    if (method !== "GET" || url.search) return { kind: "pass" };
    const blob = BLOB.exec(path);
    if (blob?.[1]) return { kind: "blob", hash: blob[1] };
    if (SNAPSHOT.some((re) => re.test(path))) return { kind: "snapshot", key: path };
    return { kind: "pass" };
  }
  if (method !== "GET") return { kind: "pass" };
  // The SPA's own routes never have a dot in their last segment; its files always do.
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last.includes(".") ? { kind: "shell", path } : { kind: "navigate" };
}

/** The answers a proxy gives when the backend behind it is down (Cloudflare's 520-527 included): to the shell that is "offline", not the server speaking. */
export const serverUnreachable = (status: number): boolean =>
  status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 527);
