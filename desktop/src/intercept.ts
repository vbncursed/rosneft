import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { withCsp } from "./csp";
import { offlineResponse } from "./offline-page";
import { parseRange } from "./range";
import { classify, type Route } from "./route";
import type { SettingsFile } from "./settings";
import type { Shell } from "./shell";
import type { Store } from "./store";
import { isUserId } from "./validate";

export type InterceptDeps = {
  origin: string;
  network: (req: Request) => Promise<Response>;
  store: Store;
  shell: Shell;
  settings: SettingsFile;
  connectivity: (online: boolean) => void;
};

// Hop-by-hop or already undone by the network stack: replaying them offline would lie.
const DROP = new Set(["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection"]);
const warn = (err: unknown) => console.warn("intercept:", err);

export function fileResponse(file: string, size: number, type: string, range: string | null): Response {
  const r = parseRange(range, size);
  if (r === "unsatisfiable") return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  const { start, end } = r ?? { start: 0, end: size - 1 };
  const headers: Record<string, string> = { "content-type": type, "content-length": String(Math.max(0, end - start + 1)), "accept-ranges": "bytes" };
  if (r) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  const body = size === 0 ? null : (Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream<Uint8Array>);
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

  return async (req) => {
    const url = new URL(req.url);
    if (url.origin !== d.origin) return d.network(req);
    const route = classify(req.method, url);
    if (route.kind === "session-reset") {
      epoch += 1;
      await d.settings.update({ userId: null });
    }
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
      seen(true);
    } catch {
      // A request the page itself cancelled says nothing about the network.
      if (req.signal.aborted) return Response.error();
      seen(false);
      return withCsp(await fallback(d, route, user));
    }
    return withCsp(await afterNetwork(d, route, user, req, res, () => epoch === born));
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

async function afterNetwork(d: InterceptDeps, route: Route, user: string | null, req: Request, res: Response, fresh: () => boolean): Promise<Response> {
  if (route.kind === "navigate" && res.ok) void d.shell.refresh();

  if (route.kind === "snapshot" && res.status === 200) {
    const body = Buffer.from(await res.clone().arrayBuffer());
    const owner = route.key === "/api/auth/me" ? await learnUser(d, body, fresh) : user;
    const headers = [...res.headers].filter(([k]) => !DROP.has(k));
    // Awaited: a few KB of JSON, and a snapshot that lands after the next
    // request would make "just went offline" depend on timing.
    if (owner && body.length > 0) await d.store.writeSnapshot(owner, route.key, { status: 200, headers }, body).catch(warn);
  }

  if (route.kind === "blob" && user && res.status === 200 && res.body && !req.headers.has("range")) {
    const [toPage, toDisk] = res.body.tee();
    const type = res.headers.get("content-type") ?? "application/octet-stream";
    void d.store
      .writeBlob(user, route.hash, type, toDisk)
      .then(() => d.store.evict(user, d.settings.value.limit))
      .catch((err: unknown) => {
        warn(err);
        void toDisk.cancel().catch(() => undefined);
      });
    return new Response(toPage, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
  return res;
}

async function fallback(d: InterceptDeps, route: Route, user: string | null): Promise<Response> {
  switch (route.kind) {
    case "navigate": {
      const index = await d.shell.file("/index.html");
      return index ? fileResponse(index.path, index.size, index.type, null) : offlineResponse();
    }
    case "shell": {
      const f = await d.shell.file(route.path);
      if (f) return fileResponse(f.path, f.size, f.type, null);
      return Response.error();
    }
    case "snapshot": {
      const s = user ? await d.store.readSnapshot(user, route.key) : null;
      if (s) return new Response(new Uint8Array(s.body), { status: s.meta.status, headers: s.meta.headers });
      return Response.error();
    }
    case "blob":
      return new Response(null, { status: 503 });
    default:
      return Response.error();
  }
}
