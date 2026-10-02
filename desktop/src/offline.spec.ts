import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Progress } from "./ipc-contract";
import { OfflineSaver, sceneHashes, type SceneLike } from "./offline";
import { SettingsFile } from "./settings";
import { Store } from "./store";

const ORIGIN = "https://andrey.vbncursed.fun";
const A = "0b5e8a3c-1f2d-4c5b-9a7e-3d2c1b0a9f8e";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const BLOBS = ["terrain-lod0", "terrain-lod1", "pump", "pano", "pdf"];
const H = Object.fromEntries(BLOBS.map((b) => [b, sha(b)]));

const scene: SceneLike = {
  territory: { slug: "ust-kut", title: "Ust-Kut" },
  artifact: { hash: H["terrain-lod0"]!, artifacts: [{ hash: H["terrain-lod0"]! }, { hash: H["terrain-lod1"]! }] },
  placements: [{ modelSlug: "pump" }],
  modelOptions: [
    { slug: "pump", artifacts: [{ hash: H.pump! }] },
    { slug: "unused", artifacts: [{ hash: sha("unused") }] },
  ],
  panoramas: [{ sourceBlobHash: H.pano! }],
  documents: [{ sourceBlobHash: H.pdf! }],
};

function server(opts: { blob?: (hash: string, signal?: AbortSignal) => Promise<Response> } = {}) {
  return vi.fn(async (url: string, signal?: AbortSignal) => {
    const p = new URL(url).pathname;
    if (p.endsWith("/scene"))
      return new Response(JSON.stringify(scene), { headers: { "content-type": "application/json" } });
    if (p.startsWith("/api/territories/"))
      return new Response(JSON.stringify(scene.territory), { headers: { "content-type": "application/json" } });
    const hash = p.split("/").pop()!;
    if (opts.blob) return opts.blob(hash, signal);
    const name = BLOBS.find((b) => sha(b) === hash)!;
    return new Response(name, { headers: { "content-type": "application/octet-stream" } });
  });
}

async function harness(fetch = server(), user: string | null = A) {
  const root = mkdtempSync(path.join(tmpdir(), "offline-"));
  const settings = new SettingsFile(path.join(root, "settings.json"));
  await settings.update({ userId: user });
  const store = new Store(path.join(root, "cache"));
  await store.init();
  const events: Progress[] = [];
  const saver = new OfflineSaver({
    origin: ORIGIN,
    fetch,
    store,
    settings,
    emit: (p) => events.push(p),
    now: () => new Date("2026-10-01T10:00:00Z"),
  });
  return { saver, store, events, fetch, root, settings };
}
type Harness = Awaited<ReturnType<typeof harness>>;
const answering = (h: Harness, status: number, suffix: string) => {
  const real = h.fetch.getMockImplementation()!;
  h.fetch.mockImplementation(async (url, signal) =>
    new URL(url).pathname.endsWith(suffix) ? new Response("", { status }) : real(url, signal),
  );
};
const snap = (h: Harness, key: string) => h.store.readSnapshot(A, key);

const last = (events: Progress[]) => events[events.length - 1];
const B = "1c6f9b4d-2a3e-4d6c-8b8f-4e3d2c1b0a90";
const nameOf = (hash: string) => BLOBS.find((b) => sha(b) === hash)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gated = () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return { gate, release };
};

afterEach(() => vi.restoreAllMocks());

describe("sceneHashes", () => {
  it("takes every LOD, the placed models, panoramas and documents — not unused models", () => {
    expect(sceneHashes(scene).toSorted()).toEqual(Object.values(H).toSorted());
  });
  it("drops anything that is not a hash", () => {
    expect(sceneHashes({ ...scene, documents: [{ sourceBlobHash: "../x" }] })).not.toContain("../x");
  });
});

describe("OfflineSaver", () => {
  it("downloads the territory, pins it and reports saved", async () => {
    const h = await harness();
    await h.saver.save("ust-kut");
    expect(last(h.events)).toEqual({ slug: "ust-kut", state: "saved", done: 5, total: 5 });
    for (const hash of Object.values(H)) expect(await h.store.blob(A, hash)).not.toBeNull();
    expect(await h.saver.list()).toEqual([
      {
        slug: "ust-kut",
        title: "Ust-Kut",
        bytes: BLOBS.join("").length,
        savedAt: "2026-10-01T10:00:00.000Z",
        syncedAt: "2026-10-01T10:00:00.000Z",
      },
    ]);
  });

  it("a second save joins the first", async () => {
    const h = await harness();
    await Promise.all([h.saver.save("ust-kut"), h.saver.save("ust-kut")]);
    expect(h.fetch.mock.calls.filter(([u]) => u.endsWith("/scene"))).toHaveLength(1);
  });

  it("cancel mid-download leaves no pin and no temp files", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = await harness(
      server({
        blob: async (_hash, signal) => {
          await gate;
          signal?.throwIfAborted();
          return new Response("never");
        },
      }),
    );
    const first = h.saver.save("ust-kut");
    await vi.waitFor(() => expect(h.events.some((e) => e.state === "saving")).toBe(true));
    h.saver.cancel("ust-kut");
    release();
    await first;
    expect(last(h.events)?.state).toBe("cancelled");
    expect(await h.store.readPins(A)).toEqual([]);
    expect(readdirSync(path.join(h.root, "cache", "tmp"))).toEqual([]);
  });

  it("ENOSPC reports no-space and leaves no pin", async () => {
    const h = await harness();
    vi.spyOn(h.store, "writeBlob").mockRejectedValue(Object.assign(new Error("disk full"), { code: "ENOSPC" }));
    await h.saver.save("ust-kut");
    expect(last(h.events)).toMatchObject({ state: "failed", error: "no-space" });
    expect(await h.store.readPins(A)).toEqual([]);
  });

  it("a dropped connection reports network", async () => {
    const h = await harness(
      server({
        blob: async () => {
          throw new TypeError("net::ERR_INTERNET_DISCONNECTED");
        },
      }),
    );
    await h.saver.save("ust-kut");
    expect(last(h.events)).toMatchObject({ state: "failed", error: "network" });
  });

  it("refuses to save signed out", async () => {
    const h = await harness(server(), null);
    await h.saver.save("ust-kut");
    expect(last(h.events)).toMatchObject({ state: "failed", error: "signed-out" });
  });

  it("remove deletes blobs no other pin needs and keeps shared ones", async () => {
    const h = await harness();
    await h.saver.save("ust-kut");
    await h.store.updatePins(A, (pins) => [
      ...pins,
      { slug: "other", title: "Other", hashes: [H.pump!], bytes: 4, savedAt: "t", syncedAt: "t" },
    ]);
    await h.saver.remove("ust-kut");
    expect(await h.store.blob(A, H.pump!)).not.toBeNull();
    expect(await h.store.blob(A, H["terrain-lod0"]!)).toBeNull();
    expect((await h.saver.list()).map((t) => t.slug)).toEqual(["other"]);
  });

  it("snapshots the scene so the viewer opens offline", async () => {
    const h = await harness();
    await h.saver.save("ust-kut");
    expect(await h.store.readSnapshot(A, "/api/territories/ust-kut/scene")).not.toBeNull();
  });

  it("a corrupt pins.json ends as failed, not an unhandled rejection", async () => {
    const h = await harness();
    mkdirSync(path.join(h.root, "cache", "users", A), { recursive: true });
    writeFileSync(path.join(h.root, "cache", "users", A, "pins.json"), "{not json");
    await h.saver.save("ust-kut");
    expect(last(h.events)).toMatchObject({ state: "failed", error: "failed" });
  });

  it("remove wins over a save that is already committing", async () => {
    const h = await harness();
    const { gate, release } = gated();
    const real = h.store.updatePins.bind(h.store);
    const spy = vi.spyOn(h.store, "updatePins").mockImplementation(async (user, change) => {
      if (spy.mock.calls.length === 2) await gate;
      return real(user, change);
    });
    const saving = h.saver.save("ust-kut");
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const removing = h.saver.remove("ust-kut");
    release();
    await removing;
    await saving;
    expect(await h.saver.list()).toEqual([]);
    expect(await h.store.readPins(A)).toEqual([]);
    expect(await h.store.blob(A, H["terrain-lod0"]!)).toBeNull();
  });

  it("an expired session on the scene reads signed-out", async () => {
    const h = await harness(vi.fn(async () => new Response("no", { status: 401 })));
    await h.saver.save("ust-kut");
    expect(last(h.events)).toMatchObject({ state: "failed", error: "signed-out" });
  });

  it("an expired session on an asset reads signed-out; other statuses stay failed", async () => {
    const h = await harness(server({ blob: async () => new Response("no", { status: 401 }) }));
    await h.saver.save("ust-kut");
    expect(last(h.events)).toMatchObject({ state: "failed", error: "signed-out" });
    const g = await harness(server({ blob: async () => new Response("no", { status: 500 }) }));
    await g.saver.save("ust-kut");
    expect(last(g.events)).toMatchObject({ state: "failed", error: "failed" });
  });

  it("emits progress at most every 250 ms and the final state last", async () => {
    let t = 1_000_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => t);
    const frozen = await harness();
    await frozen.saver.save("ust-kut");
    expect(frozen.events.filter((e) => e.state === "saving")).toHaveLength(1);
    expect(last(frozen.events)?.state).toBe("saved");
    now.mockImplementation(() => (t += 300));
    const ticking = await harness();
    await ticking.saver.save("ust-kut");
    expect(ticking.events.filter((e) => e.state === "saving")).toHaveLength(6);
    expect(last(ticking.events)).toEqual({ slug: "ust-kut", state: "saved", done: 5, total: 5 });
  });

  it("runs two saves at once; a third waits queued, and a cancelled queued save frees nothing", async () => {
    const { gate, release } = gated();
    const h = await harness(server({ blob: async (hash) => (await gate, new Response(nameOf(hash))) }));
    const scenes = () => h.fetch.mock.calls.filter(([u]) => u.endsWith("/scene")).length;
    const all = ["a", "b", "c", "d"].map((s) => h.saver.save(s));
    await vi.waitFor(() => expect(scenes()).toBe(2));
    await sleep(20);
    expect(scenes()).toBe(2);
    expect(h.events.filter((e) => e.state === "queued")).toHaveLength(4);
    expect(
      h.events
        .filter((e) => e.state === "saving")
        .map((e) => e.slug)
        .toSorted(),
    ).toEqual(["a", "b"]);
    h.saver.cancel("c");
    release();
    await Promise.all(all);
    const final = (slug: string) => last(h.events.filter((e) => e.slug === slug))?.state;
    expect(["a", "b", "c", "d"].map(final)).toEqual(["saved", "saved", "cancelled", "saved"]);
    await h.saver.save("e");
    expect(final("e")).toBe("saved");
  });

  it("pins the territory before the first byte is downloaded", async () => {
    let pinsAtFirstBlob: unknown;
    const h = await harness();
    const real = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, signal) => {
      if (url.includes("/api/assets/") && pinsAtFirstBlob === undefined)
        pinsAtFirstBlob = (await h.store.readPins(A)).map((p) => p.slug);
      return real(url, signal);
    });
    await h.saver.save("ust-kut");
    expect(pinsAtFirstBlob).toEqual(["ust-kut"]);
  });

  it("a failed resync keeps the pin, syncedAt and blobs of the saved copy", async () => {
    const h = await harness();
    await h.saver.save("ust-kut");
    const before = await h.saver.list();
    const real = h.fetch.getMockImplementation()!;
    const grown = { ...scene, panoramas: [...scene.panoramas!, { sourceBlobHash: sha("pano2") }] };
    h.fetch.mockImplementation(async (url, signal) => {
      if (url.endsWith("/scene")) return new Response(JSON.stringify(grown));
      if (url.endsWith(sha("pano2"))) throw new TypeError("net::ERR_INTERNET_DISCONNECTED");
      return real(url, signal);
    });
    await h.saver.save("ust-kut");
    expect(last(h.events)).toMatchObject({ state: "failed", error: "network" });
    expect(await h.saver.list()).toEqual(before);
    for (const hash of Object.values(H)) expect(await h.store.blob(A, hash)).not.toBeNull();
  });

  describe("a resync that finds the territory gone", () => {
    it.each([
      ["scene", "/scene"],
      ["territory", "/ust-kut"],
    ])("a 404 on the %s drops the pin, its blobs and snapshots, and emits gone", async (_n, suffix) => {
      const h = await harness();
      await h.saver.save("ust-kut");
      h.events.length = 0;
      answering(h, 404, suffix);
      await h.saver.resyncAll();
      await vi.waitFor(() => expect(h.events).toHaveLength(1));
      expect(h.events[0]).toEqual({ slug: "ust-kut", state: "gone", done: 0, total: 0 });
      expect(await h.saver.list()).toEqual([]);
      for (const hash of Object.values(H)) expect(await h.store.blob(A, hash)).toBeNull();
      expect(await snap(h, "/api/territories/ust-kut")).toBeNull();
      expect(await snap(h, "/api/territories/ust-kut/scene")).toBeNull();
    });

    it.each([
      [401, "signed-out"],
      [503, "failed"],
    ])("a %i keeps the copy and reports %s", async (status, error) => {
      const h = await harness();
      await h.saver.save("ust-kut");
      const before = await h.saver.list();
      answering(h, status, "/scene");
      await h.saver.save("ust-kut");
      expect(last(h.events)).toMatchObject({ state: "failed", error });
      expect(await h.saver.list()).toEqual(before);
      expect(await h.store.blob(A, H.pump!)).not.toBeNull();
      expect(await snap(h, "/api/territories/ust-kut/scene")).not.toBeNull();
    });

    it("a network error keeps the copy", async () => {
      const h = await harness();
      await h.saver.save("ust-kut");
      const before = await h.saver.list();
      h.fetch.mockImplementation(async () => {
        throw new TypeError("net::ERR_INTERNET_DISCONNECTED");
      });
      await h.saver.save("ust-kut");
      expect(last(h.events)).toMatchObject({ state: "failed", error: "network" });
      expect(await h.saver.list()).toEqual(before);
    });

    it("a 404 on a blob keeps the copy", async () => {
      const h = await harness();
      await h.saver.save("ust-kut");
      const before = await h.saver.list();
      const real = h.fetch.getMockImplementation()!;
      const grown = { ...scene, panoramas: [...scene.panoramas!, { sourceBlobHash: sha("pano2") }] };
      h.fetch.mockImplementation(async (url, signal) => {
        if (url.endsWith("/scene")) return new Response(JSON.stringify(grown));
        if (url.endsWith(sha("pano2"))) return new Response("", { status: 404 });
        return real(url, signal);
      });
      await h.saver.save("ust-kut");
      expect(last(h.events)).toMatchObject({ state: "failed" });
      expect(await h.saver.list()).toEqual(before);
      expect(await h.store.blob(A, H.pump!)).not.toBeNull();
    });

    it("a 404 that arrives after cancelAll keeps the copy", async () => {
      const h = await harness();
      await h.saver.save("ust-kut");
      const before = await h.saver.list();
      h.fetch.mockImplementation(async () => {
        h.saver.cancelAll();
        return new Response("", { status: 404 });
      });
      await h.saver.save("ust-kut");
      expect(last(h.events)).toMatchObject({ state: "cancelled" });
      expect(await h.saver.list()).toEqual(before);
      expect(await h.store.blob(A, H.pump!)).not.toBeNull();
    });

    it("a 404 that arrives after the user changed keeps the first user's copy", async () => {
      const h = await harness();
      await h.saver.save("ust-kut");
      h.fetch.mockImplementation(async () => {
        await h.settings.update({ userId: B });
        return new Response("", { status: 404 });
      });
      await h.saver.save("ust-kut");
      expect(last(h.events)).toMatchObject({ state: "cancelled" });
      expect((await h.store.readPins(A)).map((p) => p.slug)).toEqual(["ust-kut"]);
      expect(await h.store.blob(A, H.pump!)).not.toBeNull();
    });

    it("still reports gone when a snapshot cannot be removed", async () => {
      const h = await harness();
      await h.saver.save("ust-kut");
      vi.spyOn(h.store, "removeSnapshot").mockRejectedValue(new Error("EPERM"));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      answering(h, 404, "/scene");
      await h.saver.save("ust-kut");
      expect(last(h.events)).toMatchObject({ state: "gone" });
      expect(await h.saver.list()).toEqual([]);
      expect(warn).toHaveBeenCalled();
    });

    it("a blob another pinned territory holds survives", async () => {
      const h = await harness();
      await h.saver.save("ust-kut");
      await h.store.updatePins(A, (all) => [
        ...all,
        { slug: "other", title: "Other", hashes: [H.pump!], bytes: 4, savedAt: "t", syncedAt: "t" },
      ]);
      answering(h, 404, "/scene");
      await h.saver.save("ust-kut");
      expect(last(h.events)).toMatchObject({ state: "gone" });
      expect(await h.store.blob(A, H.pump!)).not.toBeNull();
      expect(await h.store.blob(A, H.pano!)).toBeNull();
      expect((await h.store.readPins(A)).map((p) => p.slug)).toEqual(["other"]);
    });

    it("a first save (no syncedAt) that gets 404 fails as before and removes nothing else", async () => {
      const h = await harness();
      answering(h, 404, "/scene");
      await h.saver.save("ust-kut");
      expect(last(h.events)).toMatchObject({ state: "failed", error: "failed" });
      expect(h.events.some((e) => e.state === "gone")).toBe(false);
    });
  });

  it("resyncAll saves every pin again", async () => {
    const h = await harness();
    await h.saver.save("a");
    await h.saver.save("b");
    const scenes = () => h.fetch.mock.calls.filter(([u]) => u.endsWith("/scene"));
    expect(scenes()).toHaveLength(2);
    await h.saver.resyncAll();
    await vi.waitFor(() => expect(h.events.filter((e) => e.state === "saved")).toHaveLength(4));
    expect(
      scenes()
        .map(([u]) => new URL(u).pathname.split("/")[3])
        .toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
    ).toEqual(["a", "a", "b", "b"]);
  });

  it("resyncAll is silent: only the final saved, no queued/saving", async () => {
    const h = await harness();
    await h.saver.save("a");
    h.events.length = 0;
    await h.saver.resyncAll();
    await vi.waitFor(() => expect(h.events).toHaveLength(1));
    expect(h.events[0]).toMatchObject({ slug: "a", state: "saved" });
  });

  it("a failed resyncAll emits nothing and keeps the copy", async () => {
    const h = await harness();
    await h.saver.save("a");
    const before = await h.saver.list();
    h.events.length = 0;
    h.fetch.mockImplementation(async () => {
      throw new TypeError("net::ERR_INTERNET_DISCONNECTED");
    });
    await h.saver.resyncAll();
    await sleep(50);
    expect(h.events).toEqual([]);
    expect(await h.saver.list()).toEqual(before);
  });

  it("a user save of a first-time territory keeps full progress", async () => {
    const h = await harness();
    await h.saver.save("a");
    expect(h.events.map((e) => e.state)).toContain("queued");
    expect(h.events.map((e) => e.state)).toContain("saving");
  });

  it("cancelling a save still queued answers cancelled at once and never takes a slot", async () => {
    const { gate, release } = gated();
    const h = await harness(server({ blob: async (hash) => (await gate, new Response(nameOf(hash))) }));
    const running = ["a", "b"].map((s) => h.saver.save(s));
    await vi.waitFor(() => expect(h.events.filter((e) => e.state === "saving")).toHaveLength(2));
    const queued = h.saver.save("c");
    h.saver.cancel("c");
    await queued;
    expect(last(h.events.filter((e) => e.slug === "c"))?.state).toBe("cancelled");
    expect(h.fetch.mock.calls.some(([u]) => u.includes("/c/"))).toBe(false);
    release();
    await Promise.all(running);
    await h.saver.save("d");
    expect(last(h.events.filter((e) => e.slug === "d"))?.state).toBe("saved");
  });

  it("sums unequal blob sizes exactly when downloads finish out of order", async () => {
    const delay: Record<string, number> = { "terrain-lod0": 40, "terrain-lod1": 10, pump: 30, pano: 0, pdf: 20 };
    const h = await harness(
      server({ blob: async (hash) => (await sleep(delay[nameOf(hash)]!), new Response(nameOf(hash))) }),
    );
    await h.saver.save("ust-kut");
    expect((await h.saver.list())[0]?.bytes).toBe(BLOBS.join("").length);
  });

  it("an evict failure after the final commit does not undo the save", async () => {
    const h = await harness();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(h.store, "evict").mockRejectedValue(new Error("EIO"));
    await h.saver.save("ust-kut");
    expect(last(h.events)?.state).toBe("saved");
    expect((await h.saver.list()).map((t) => t.slug)).toEqual(["ust-kut"]);
  });

  it("a blob another save pins while remove is deleting survives", async () => {
    const h = await harness();
    await h.saver.save("ust-kut");
    const real = h.store.updatePins.bind(h.store);
    let first = true;
    vi.spyOn(h.store, "updatePins").mockImplementation(async (user, change) => {
      const pins = await real(user, change);
      if (first) {
        first = false;
        // A concurrent save pins the pump after remove's unpin, before remove deletes.
        await real(user, (all) => [
          ...all,
          { slug: "other", title: "o", hashes: [H.pump!], bytes: 0, savedAt: "t", syncedAt: "t" },
        ]);
      }
      return pins;
    });
    await h.saver.remove("ust-kut");
    expect(await h.store.blob(A, H.pump!)).not.toBeNull();
    expect(await h.store.blob(A, H.pdf!)).toBeNull();
  });

  it("cancelAll stops every running and queued save", async () => {
    const { gate, release } = gated();
    const h = await harness(
      server({ blob: async (_hash, signal) => (await gate, signal?.throwIfAborted(), new Response("never")) }),
    );
    const runs = ["a", "b", "c"].map((slug) => h.saver.save(slug));
    await vi.waitFor(() => expect(h.events.some((e) => e.state === "saving")).toBe(true));
    h.saver.cancelAll();
    release();
    await Promise.all(runs);
    for (const slug of ["a", "b", "c"]) expect(h.events.findLast((e) => e.slug === slug)?.state).toBe("cancelled");
    expect(await h.store.readPins(A)).toEqual([]);
  });

  it("a save whose user signed out mid-flight writes no blob into the old user's store", async () => {
    const { gate, release } = gated();
    const h = await harness(server({ blob: async (hash) => (await gate, new Response(nameOf(hash))) }));
    const run = h.saver.save("ust-kut");
    await vi.waitFor(() => expect(h.events.some((e) => e.state === "saving")).toBe(true));
    await h.settings.update({ userId: B });
    release();
    await run;
    expect(last(h.events)?.state).toBe("cancelled");
    expect(await h.store.blobFiles(A)).toEqual([]);
    expect(await h.store.readPins(A)).toEqual([]);
  });

  it("a malformed scene is failed, not network", async () => {
    const { placements: _, ...broken } = scene;
    const h = await harness(vi.fn(async () => new Response(JSON.stringify(broken))));
    await h.saver.save("ust-kut");
    expect(last(h.events)).toMatchObject({ state: "failed", error: "failed" });
  });

  it("a queued save is dropped when the signed-in user changed meanwhile", async () => {
    const { gate, release } = gated();
    const h = await harness(server({ blob: async (hash) => (await gate, new Response(nameOf(hash))) }));
    const first = [h.saver.save("a"), h.saver.save("b")];
    await vi.waitFor(() => expect(h.events.filter((e) => e.state === "saving")).toHaveLength(2));
    const queued = h.saver.save("c");
    await h.settings.update({ userId: B });
    release();
    await Promise.all(first);
    await queued;
    expect(last(h.events.filter((e) => e.slug === "c"))?.state).toBe("cancelled");
    expect(h.fetch.mock.calls.filter(([u]) => u.includes("/territories/c/"))).toHaveLength(0);
    expect(await h.store.readPins(B)).toEqual([]);
  });
});
