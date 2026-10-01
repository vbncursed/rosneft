import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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
    if (p.endsWith("/scene")) return new Response(JSON.stringify(scene), { headers: { "content-type": "application/json" } });
    if (p.startsWith("/api/territories/")) return new Response(JSON.stringify(scene.territory), { headers: { "content-type": "application/json" } });
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
  const saver = new OfflineSaver({ origin: ORIGIN, fetch, store, settings, emit: (p) => events.push(p), now: () => new Date("2026-10-01T10:00:00Z") });
  return { saver, store, events, fetch, root };
}
const last = (events: Progress[]) => events[events.length - 1];

describe("sceneHashes", () => {
  it("takes every LOD, the placed models, panoramas and documents — not unused models", () => {
    expect(sceneHashes(scene).sort()).toEqual(Object.values(H).sort());
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
      { slug: "ust-kut", title: "Ust-Kut", bytes: BLOBS.join("").length, savedAt: "2026-10-01T10:00:00.000Z", syncedAt: "2026-10-01T10:00:00.000Z" },
    ]);
  });

  it("a second save joins the first", async () => {
    const h = await harness();
    await Promise.all([h.saver.save("ust-kut"), h.saver.save("ust-kut")]);
    expect(h.fetch.mock.calls.filter(([u]) => String(u).endsWith("/scene"))).toHaveLength(1);
  });

  it("cancel mid-download leaves no pin and no temp files", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = await harness(server({
      blob: async (_hash, signal) => {
        await gate;
        signal?.throwIfAborted();
        return new Response("never");
      },
    }));
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
    const h = await harness(server({ blob: async () => { throw new TypeError("net::ERR_INTERNET_DISCONNECTED"); } }));
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
    await h.store.updatePins(A, (pins) => [...pins, { slug: "other", title: "Other", hashes: [H.pump!], bytes: 4, savedAt: "t", syncedAt: "t" }]);
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
});
