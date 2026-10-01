import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CSP } from "./csp";
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
const offline = () => Promise.reject(new TypeError("net::ERR_INTERNET_DISCONNECTED"));

async function harness(network: (r: Request) => Promise<Response>, user: string | null = A, shellFiles: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "intercept-"));
  const settings = new SettingsFile(path.join(root, "settings.json"));
  await settings.update({ userId: user });
  const store = new Store(path.join(root, "cache"));
  await store.init();
  const shell = new Shell(path.join(root, "cache", "shell"), ORIGIN, async (url) => {
    const p = new URL(url).pathname;
    if (p === "/shell-manifest.json") {
      const files = Object.entries(shellFiles).map(([path, body]) => ({ path, size: body.length }));
      return Object.keys(shellFiles).length
        ? new Response(JSON.stringify({ id: "a".repeat(32), files }), { headers: { "content-type": "application/json" } })
        : new Response("", { status: 404 });
    }
    return shellFiles[p] === undefined ? new Response("", { status: 404 }) : new Response(shellFiles[p]);
  });
  const states: boolean[] = [];
  const net = vi.fn(network);
  const handle = createHandler({ origin: ORIGIN, network: net, store, shell, settings, connectivity: (o) => states.push(o) });
  return { handle, net, store, settings, shell, states, root };
}

describe("createHandler", () => {
  it("answers a whitelisted GET from its snapshot once the network is gone", async () => {
    let up = true;
    const h = await harness(async () => (up ? new Response('[{"slug":"a"}]', { headers: { "content-type": "application/json" } }) : offline()));
    expect(await (await h.handle(req("/api/territories"))).text()).toBe('[{"slug":"a"}]');
    up = false;
    const res = await h.handle(req("/api/territories"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('[{"slug":"a"}]');
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
    const h = await harness(async () => new Response("glb bytes", { headers: { "content-type": "model/gltf-binary" } }));
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

  it("a blob that is not cached answers 503 with no network", async () => {
    const h = await harness(offline);
    expect((await h.handle(req(`/api/assets/${sha("x")}`))).status).toBe(503);
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
    let release: (r: Response) => void = () => undefined;
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

  it("serves a cached text/html blob with the CSP", async () => {
    const hash = sha("<script>");
    const h = await harness(offline);
    await h.store.writeBlob(A, hash, "text/html", new Response("<script>").body as ReadableStream<Uint8Array>);
    expect((await h.handle(req(`/api/assets/${hash}`))).headers.get("content-security-policy")).toBe(CSP);
  });

  it("between login and /me neither reads nor writes a blob on disk", async () => {
    const hash = sha("A's model");
    const h = await harness(async (r) => (new URL(r.url).pathname === "/api/auth/login" ? new Response("{}") : new Response("fresh")));
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
      up ? new Response("[1]", { headers: { "set-cookie": "s=1", "content-encoding": "gzip", "content-length": "99", "x-keep": "yes" } }) : offline(),
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
