import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { withCsp } from "./csp";
import { offlineResponse } from "./offline-page";
import { parseRange } from "./range";
import { classify, serverUnreachable, type Route } from "./route";
import type { SettingsFile } from "./settings";
import type { Shell } from "./shell";
import type { Store } from "./store";
import { isUserId } from "./validate";

export type InterceptDeps = {
  origin: string;
  network: (req: Request, init?: { cache?: RequestCache }) => Promise<Response>;
  store: Store;
  shell: Shell;
  settings: SettingsFile;
  connectivity: (online: boolean) => void;
  /** A new session cookie is about to be handed out: whatever runs on the old one must stop. */
  onSessionReset: () => void;
};

// Hop-by-hop or already undone by the network stack: replaying them offline would lie.
const DROP = new Set(["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection"]);
const warn = (err: unknown) => console.warn("intercept:", err);

export function fileResponse(file: string, size: number, type: string, range: string | null): Response {
  const r = parseRange(range, size);
  if (r === "unsatisfiable")
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  const { start, end } = r ?? { start: 0, end: size - 1 };
  const headers: Record<string, string> = {
    "content-type": type,
    "content-length": String(Math.max(0, end - start + 1)),
    "accept-ranges": "bytes",
  };
  if (r) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  const body =
    size === 0
      ? null
      : (Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream<Uint8Array>);
  return new Response(body, { status: r ? 206 : 200, headers });
}

export function createHandler(d: InterceptDeps): (req: Request) => Promise<Response> {
  let online: boolean | null = null;
  // Bumped on every session reset: a /me that was in flight across one belongs to the old session.
  let epoch = 0;
  const seen = (now: boolean) => {
    if (now === online) return;
    online = now;
    d.connectivity(now);
  };

  // One eviction at a time per user; a download finishing meanwhile asks for exactly one more run.
  const evicting = new Map<string, { again: boolean }>();
  const scheduleEvict = (user: string) => {
    const running = evicting.get(user);
    if (running) {
      running.again = true;
      return;
    }
    const state = { again: false };
    evicting.set(user, state);
    void (async () => {
      do {
        state.again = false;
        await d.store.evict(user, d.settings.value.limit).catch(warn);
      } while (state.again);
      evicting.delete(user);
    })();
  };

  return async (req) => {
    const url = new URL(req.url);
    if (url.origin !== d.origin) return d.network(req);
    const route = classify(req.method, url);
    if (route.kind === "session-reset") {
      epoch += 1;
      d.onSessionReset();
      await d.settings.update({ userId: null });
    }
    // Only the gateway speaks for connectivity: shell files may be answered from Chromium's HTTP cache.
    const gateway = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const born = epoch;
    const user = d.settings.value.userId;

    if (route.kind === "blob" && user) {
      const hit = await d.store.blob(user, route.hash);
      // ponytail: eviction can unlink the file between blob() and the lazy createReadStream open (truncated body); open the fd before responding to close it.
      if (hit) return withCsp(fileResponse(hit.path, hit.size, hit.type, req.headers.get("range")));
    }

    let res: Response;
    try {
      res = await d.network(req);
      if (gateway && serverUnreachable(res.status)) {
        // A dead backend is offline whichever route asked; a saved copy, where the route has one, replaces its answer.
        seen(false);
        const cacheable = route.kind === "snapshot" || route.kind === "blob";
        const copy = cacheable ? await savedCopy(d, route, user) : null;
        if (copy) {
          void res.body?.cancel().catch(() => undefined);
          return withCsp(copy);
        }
      } else if (gateway) seen(true);
    } catch {
      // A request the page itself cancelled says nothing about the network.
      if (req.signal.aborted) return Response.error();
      if (gateway) seen(false);
      return withCsp(await fallback(d, route, user, req));
    }
    return withCsp(await afterNetwork(d, route, user, req, res, () => epoch === born, scheduleEvict));
  };
}

async function learnUser(d: InterceptDeps, body: Buffer, fresh: () => boolean): Promise<string | null> {
  try {
    const id = (JSON.parse(body.toString("utf8")) as { id?: unknown }).id;
    if (!isUserId(id) || !fresh()) return null;
    if (id !== d.settings.value.userId) await d.settings.update({ userId: id });
    return id;
  } catch {
    return null;
  }
}

async function afterNetwork(
  d: InterceptDeps,
  route: Route,
  user: string | null,
  req: Request,
  res: Response,
  fresh: () => boolean,
  scheduleEvict: (user: string) => void,
): Promise<Response> {
  if (route.kind === "navigate" && res.ok) void d.shell.refresh();

  if (route.kind === "snapshot" && res.status === 200) {
    const body = Buffer.from(await res.clone().arrayBuffer());
    const owner = route.key === "/api/auth/me" ? await learnUser(d, body, fresh) : user;
    const headers = [...res.headers].filter(([k]) => !DROP.has(k));
    // Awaited: a few KB of JSON, and a snapshot that lands after the next
    // request would make "just went offline" depend on timing.
    if (owner && body.length > 0)
      await d.store.writeSnapshot(owner, route.key, { status: 200, headers }, body).catch(warn);
  }

  if (route.kind === "blob" && user && res.status === 200 && res.body && !req.headers.has("range")) {
    const [toPage, toDisk] = res.body.tee();
    const type = res.headers.get("content-type") ?? "application/octet-stream";
    void d.store
      .writeBlob(user, route.hash, type, toDisk)
      .then(() => scheduleEvict(user))
      .catch((err: unknown) => {
        warn(err);
        void toDisk.cancel().catch(() => undefined);
      });
    return new Response(toPage, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
  return res;
}

/** What the shell holds for a cacheable /api route, or null. */
async function savedCopy(d: InterceptDeps, route: Route, user: string | null): Promise<Response | null> {
  if (route.kind === "snapshot" && user) {
    const s = await d.store.readSnapshot(user, route.key);
    if (s) return new Response(new Uint8Array(s.body), { status: s.meta.status, headers: s.meta.headers });
  }
  if (route.kind === "blob" && user) {
    const hit = await d.store.blob(user, route.hash);
    if (hit) return fileResponse(hit.path, hit.size, hit.type, null);
  }
  return null;
}

async function fallback(d: InterceptDeps, route: Route, user: string | null, req: Request): Promise<Response> {
  switch (route.kind) {
    case "navigate": {
      const index = await d.shell.file("/index.html");
      return index ? fileResponse(index.path, index.size, index.type, null) : offlineResponse();
    }
    case "shell": {
      const f = await d.shell.file(route.path);
      if (f) return fileResponse(f.path, f.size, f.type, null);
      // Content-hashed files: Chromium's cached copy is the right one. force-cache offline gives it or fails fast (only-if-cached is refused for a cors-mode request).
      // ponytail: a chunk never fetched and not in a finished generation still fails until the next online refresh.
      return d.network(req, { cache: "force-cache" }).then(
        (r) => (r.ok ? r : Response.error()),
        () => Response.error(),
      );
    }
    default:
      return (await savedCopy(d, route, user)) ?? Response.error();
  }
}
