import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BLOB_CSP, CSP } from "./csp";
import { createHandler } from "./intercept";
import { SettingsFile } from "./settings";
import { Shell } from "./shell";
import { Store } from "./store";

const ORIGIN = "https://andrey.vbncursed.fun";
const A = "0b5e8a3c-1f2d-4c5b-9a7e-3d2c1b0a9f8e";
const B = "1c6f9b4d-2a3e-4d6c-8b8f-4e3d2c1b0a9f";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const req = (p: string, init?: RequestInit) => new Request(`${ORIGIN}${p}`, init);
const me = (id: string) => new Response(JSON.stringify({ id }), { headers: { "content-type": "application/json" } });
const noop = () => undefined;
const offline = () => Promise.reject(new TypeError("net::ERR_INTERNET_DISCONNECTED"));

async function harness(
  network: (r: Request, init?: { cache?: RequestCache }) => Promise<Response>,
  user: string | null = A,
  shellFiles: Record<string, string> = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), "intercept-"));
  const settings = new SettingsFile(path.join(root, "settings.json"));
  await settings.update({ userId: user });
  const store = new Store(path.join(root, "cache"));
  await store.init();
  const shell = new Shell(path.join(root, "cache", "shell"), ORIGIN, async (url) => {
    const p = new URL(url).pathname;
    if (p === "/shell-manifest.json") {
      const files = Object.entries(shellFiles).map(([file, body]) => ({ path: file, size: body.length }));
      return Object.keys(shellFiles).length
        ? new Response(JSON.stringify({ id: "a".repeat(32), files }), {
            headers: { "content-type": "application/json" },
          })
        : new Response("", { status: 404 });
    }
    return shellFiles[p] === undefined ? new Response("", { status: 404 }) : new Response(shellFiles[p]);
  });
  const states: boolean[] = [];
  const net = vi.fn(network);
  const reset = vi.fn();
  const handle = createHandler({
    origin: ORIGIN,
    network: net,
    store,
    shell,
    settings,
    connectivity: (o) => states.push(o),
    onSessionReset: reset,
  });
  return { handle, net, store, settings, shell, states, root, reset };
}

describe("createHandler", () => {
  it("answers a whitelisted GET from its snapshot once the network is gone", async () => {
    let up = true;
    const h = await harness(async () =>
      up ? new Response('[{"slug":"a"}]', { headers: { "content-type": "application/json" } }) : offline(),
    );
    expect(await (await h.handle(req("/api/territories"))).text()).toBe('[{"slug":"a"}]');
    up = false;
    const res = await h.handle(req("/api/territories"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('[{"slug":"a"}]');
  });

  it("answers /api/jobs from its snapshot once the network is gone", async () => {
    let up = true;
    const h = await harness(async () =>
      up ? new Response("[]", { headers: { "content-type": "application/json" } }) : offline(),
    );
    await h.handle(req("/api/jobs"));
    up = false;
    const res = await h.handle(req("/api/jobs"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("[]");
  });

  it("learns the current user from /api/auth/me", async () => {
    const h = await harness(async () => me(B), null);
    await (await h.handle(req("/api/auth/me"))).text();
    expect(h.settings.value.userId).toBe(B);
  });

  it("forgets the user on login even when the network fails", async () => {
    const h = await harness(offline);
    expect((await h.handle(req("/api/auth/login", { method: "POST", body: "{}" }))).type).toBe("error");
    expect(h.settings.value.userId).toBeNull();
  });

  it("account switch never serves the previous user's blob", async () => {
    const hash = sha("A's model");
    const h = await harness(async (r) => {
      const p = new URL(r.url).pathname;
      if (p === "/api/auth/me") return me(B);
      if (p === "/api/auth/login") return new Response("{}");
      return new Response("not yours", { status: 404 });
    });
    await h.store.writeBlob(A, hash, "model/gltf-binary", new Response("A's model").body as ReadableStream<Uint8Array>);
    await (await h.handle(req("/api/auth/login", { method: "POST", body: "{}" }))).text();
    await (await h.handle(req("/api/auth/me"))).text();
    const res = await h.handle(req(`/api/assets/${hash}`));
    expect(res.status).toBe(404);
    expect(h.net).toHaveBeenLastCalledWith(expect.objectContaining({ url: `${ORIGIN}/api/assets/${hash}` }));
  });

  it("stores a blob on the way through and serves it from disk next time", async () => {
    const hash = sha("glb bytes");
    const h = await harness(
      async () => new Response("glb bytes", { headers: { "content-type": "model/gltf-binary" } }),
    );
    expect(await (await h.handle(req(`/api/assets/${hash}`))).text()).toBe("glb bytes");
    await vi.waitFor(async () => expect(await h.store.blob(A, hash)).not.toBeNull());
    h.net.mockClear();
    const res = await h.handle(req(`/api/assets/${hash}`));
    expect(await res.text()).toBe("glb bytes");
    expect(res.headers.get("content-type")).toBe("model/gltf-binary");
    expect(res.headers.get("content-length")).toBe("9");
    expect(h.net).not.toHaveBeenCalled();
  });

  it("serves a byte range of a cached blob, and 416 past its end", async () => {
    const hash = sha("0123456789");
    const h = await harness(offline);
    await h.store.writeBlob(A, hash, "application/pdf", new Response("0123456789").body as ReadableStream<Uint8Array>);
    const part = await h.handle(req(`/api/assets/${hash}`, { headers: { range: "bytes=2-4" } }));
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(await part.text()).toBe("234");
    expect((await h.handle(req(`/api/assets/${hash}`, { headers: { range: "bytes=10-" } }))).status).toBe(416);
  });

  it("a blob that is not cached fails like a dead network, not with a made-up status", async () => {
    const h = await harness(offline);
    expect((await h.handle(req(`/api/assets/${sha("x")}`))).type).toBe("error");
  });

  it("a dead backend (502) serves the saved snapshot, drops the upstream body and reports offline", async () => {
    let up = true;
    const dead = new Response("bad gateway", { status: 502 });
    const cancel = vi.spyOn(dead.body!, "cancel");
    const h = await harness(async () => (up ? new Response("[1]") : dead));
    await (await h.handle(req("/api/models"))).text();
    up = false;
    const res = await h.handle(req("/api/models"));
    expect(cancel).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("[1]");
    expect(h.states).toEqual([true, false]);
  });

  it("a 502 on an uncached /api route never reads as online", async () => {
    let up = false;
    const h = await harness(async () => (up ? new Response("[]") : offline()));
    await h.handle(req("/api/jobs"));
    up = true;
    await h.handle(req("/api/models"));
    expect(h.states).toEqual([false, true]);
    const dead = await harness(async () => new Response("bad", { status: 502 }));
    const res = await dead.handle(req("/api/jobs"));
    expect(res.status).toBe(502);
    expect(dead.states).toEqual([false]);
  });

  it("a dead backend with no saved snapshot passes its answer through", async () => {
    const h = await harness(async () => new Response("down", { status: 503 }));
    const res = await h.handle(req("/api/models"));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("down");
  });

  it("an ordinary server error (500) is not read as offline even with a snapshot", async () => {
    let ok = true;
    const h = await harness(async () => (ok ? new Response("[1]") : new Response("boom", { status: 500 })));
    await (await h.handle(req("/api/models"))).text();
    ok = false;
    expect((await h.handle(req("/api/models"))).status).toBe(500);
  });

  it("a blob already on disk is served even when the backend answers 503", async () => {
    const hash = sha("on disk");
    const h = await harness(async () => new Response("down", { status: 503 }));
    await h.store.writeBlob(A, hash, "x/y", new Response("on disk").body as ReadableStream<Uint8Array>);
    expect(await (await h.handle(req(`/api/assets/${hash}`))).text()).toBe("on disk");
  });

  it("a blob not on disk passes a 503 through unchanged", async () => {
    const h = await harness(async () => new Response("down", { status: 503 }));
    expect((await h.handle(req(`/api/assets/${sha("nope")}`))).status).toBe(503);
  });

  it("a burst of blob downloads runs the eviction at most twice", async () => {
    const letters = ["a", "b", "c", "d", "e", "f"];
    const h = await harness(async (r) => new Response(letters.find((n) => r.url.endsWith(sha(n)))));
    const evict = vi.spyOn(h.store, "evict").mockImplementation(() => new Promise((r) => setTimeout(r, 40)));
    const names = letters.map((n) => `/api/assets/${sha(n)}`);
    await Promise.all(names.map(async (p) => (await h.handle(req(p))).text()));
    await new Promise((r) => setTimeout(r, 200));
    expect(evict.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(evict.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("a session reset cancels the running saves first", async () => {
    const h = await harness(async () => new Response("{}"));
    await (await h.handle(req("/api/auth/logout", { method: "POST" }))).text();
    expect(h.reset).toHaveBeenCalledTimes(1);
  });

  it("a shell file the generation lacks comes from Chromium's HTTP cache, and a miss fails", async () => {
    const cached = vi.fn(async (_r: Request, init?: { cache?: RequestCache }) =>
      init?.cache === "force-cache" ? new Response("cached js") : offline(),
    );
    const h = await harness(cached);
    const res = await h.handle(req("/assets/lazy.js"));
    expect(await res.text()).toBe("cached js");
    expect(cached).toHaveBeenLastCalledWith(expect.any(Request), { cache: "force-cache" });
    const miss = await harness(offline);
    expect((await miss.handle(req("/assets/lazy.js"))).type).toBe("error");
  });

  it("the current generation wins over Chromium's cache", async () => {
    const h = await harness(offline, A, { "/index.html": "<html>", "/assets/a.js": "gen js" });
    await h.shell.refresh();
    h.net.mockClear();
    expect(await (await h.handle(req("/assets/a.js"))).text()).toBe("gen js");
    expect(h.net).toHaveBeenCalledTimes(1);
  });

  it("navigation with no shell answers the built-in offline page", async () => {
    const h = await harness(offline);
    const res = await h.handle(req("/territories"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toBe(CSP);
    expect(await res.text()).toContain("offline");
  });

  it("puts the CSP on HTML from the network", async () => {
    const h = await harness(async () => new Response("<html>", { headers: { "content-type": "text/html" } }));
    expect((await h.handle(req("/"))).headers.get("content-security-policy")).toBe(CSP);
  });

  it("reports connectivity only when it changes", async () => {
    let up = true;
    const h = await harness(async () => (up ? new Response("{}") : offline()));
    await h.handle(req("/api/models"));
    await h.handle(req("/api/models"));
    up = false;
    await h.handle(req("/api/models"));
    await h.handle(req("/api/models"));
    expect(h.states).toEqual([true, false]);
  });

  it("a shell file answered from Chromium's cache does not report online while /api is down", async () => {
    const h = await harness(async (r) =>
      new URL(r.url).pathname.startsWith("/api/") ? offline() : new Response("js"),
    );
    await h.handle(req("/api/models"));
    await h.handle(req("/assets/a.js"));
    await h.handle(req("/"));
    await h.handle(req("/assets/b.js"));
    await h.handle(req("/api/models"));
    expect(h.states).toEqual([false]);
  });

  it("a shell or navigation failure alone says nothing about connectivity", async () => {
    const h = await harness(offline);
    await h.handle(req("/assets/a.js"));
    await h.handle(req("/"));
    expect(h.states).toEqual([]);
  });

  it("does not read a request the page cancelled as being offline", async () => {
    const ac = new AbortController();
    const h = await harness(async () => {
      ac.abort();
      throw new DOMException("aborted", "AbortError");
    });
    expect((await h.handle(req("/api/models", { signal: ac.signal }))).type).toBe("error");
    expect(h.states).toEqual([]);
  });

  it("lets other origins through untouched", async () => {
    const h = await harness(async () => new Response("<x>", { headers: { "content-type": "text/html" } }));
    const res = await h.handle(new Request("https://example.com/"));
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("never snapshots a non-200", async () => {
    let up = true;
    const h = await harness(async () => (up ? new Response("{}", { status: 500 }) : offline()));
    await h.handle(req("/api/models"));
    up = false;
    expect((await h.handle(req("/api/models"))).type).toBe("error");
  });
});

describe("createHandler isolation", () => {
  it("a stale /api/auth/me cannot hand the cache back to the previous user", async () => {
    let release: (r: Response) => void = noop;
    const h = await harness((r) => {
      const p = new URL(r.url).pathname;
      if (p === "/api/auth/login") return Promise.resolve(new Response("{}"));
      return new Promise<Response>((res) => (release = res));
    });
    const stale = h.handle(req("/api/auth/me"));
    await (await h.handle(req("/api/auth/login", { method: "POST", body: "{}" }))).text();
    release(me(A));
    await (await stale).text();
    expect(h.settings.value.userId).toBeNull();
    expect(await h.store.readSnapshot(A, "/api/auth/me")).toBeNull();
  });

  it("serves a cached blob, even text/html, with the sandbox CSP and nosniff", async () => {
    const hash = sha("<script>");
    const h = await harness(offline);
    await h.store.writeBlob(A, hash, "text/html", new Response("<script>").body as ReadableStream<Uint8Array>);
    const res = await h.handle(req(`/api/assets/${hash}`));
    expect(res.headers.get("content-security-policy")).toBe(BLOB_CSP);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves a network blob with the sandbox CSP and nosniff", async () => {
    const hash = sha("pdf");
    const h = await harness(async () => new Response("pdf", { headers: { "content-type": "application/pdf" } }));
    const res = await h.handle(req(`/api/assets/${hash}`));
    expect(res.headers.get("content-security-policy")).toBe(BLOB_CSP);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    await res.text();
  });

  it("between login and /me neither reads nor writes a blob on disk", async () => {
    const hash = sha("A's model");
    const h = await harness(async (r) =>
      new URL(r.url).pathname === "/api/auth/login" ? new Response("{}") : new Response("fresh"),
    );
    await h.store.writeBlob(A, hash, "model/gltf-binary", new Response("A's model").body as ReadableStream<Uint8Array>);
    await (await h.handle(req("/api/auth/login", { method: "POST", body: "{}" }))).text();
    h.net.mockClear();
    expect(await (await h.handle(req(`/api/assets/${hash}`))).text()).toBe("fresh");
    expect(h.net).toHaveBeenCalledTimes(1);
    await h.store.removeBlobs(A, [hash]);
    await new Promise((r) => setTimeout(r, 30));
    expect(await h.store.blob(A, hash)).toBeNull();
    expect(await h.store.blob(B, hash)).toBeNull();
  });

  it("writes no snapshot while the user is unknown", async () => {
    let up = true;
    const h = await harness(async () => (up ? new Response("[1]") : offline()), null);
    await (await h.handle(req("/api/models"))).text();
    up = false;
    expect((await h.handle(req("/api/models"))).type).toBe("error");
  });

  it("a snapshot replay carries no set-cookie, content-encoding or content-length", async () => {
    let up = true;
    const h = await harness(async () =>
      up
        ? new Response("[1]", {
            headers: { "set-cookie": "s=1", "content-encoding": "gzip", "content-length": "99", "x-keep": "yes" },
          })
        : offline(),
    );
    await (await h.handle(req("/api/models"))).text();
    up = false;
    const res = await h.handle(req("/api/models"));
    expect(res.headers.get("x-keep")).toBe("yes");
    for (const k of ["set-cookie", "content-encoding", "content-length"]) expect(res.headers.get(k)).toBeNull();
  });

  it("serves the shell generation offline, index.html with the CSP", async () => {
    const h = await harness(offline, A, { "/index.html": "<html>app</html>", "/assets/a.js": "js" });
    await h.shell.refresh();
    const nav = await h.handle(req("/territories"));
    expect(await nav.text()).toBe("<html>app</html>");
    expect(nav.headers.get("content-security-policy")).toBe(CSP);
    expect(await (await h.handle(req("/assets/a.js"))).text()).toBe("js");
  });

  it("does not snapshot an empty 200", async () => {
    let up = true;
    const h = await harness(async () => (up ? new Response("") : offline()));
    await h.handle(req("/api/models"));
    up = false;
    expect((await h.handle(req("/api/models"))).type).toBe("error");
  });
});
