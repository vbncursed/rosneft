import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { pickVictims, Store, type Pin } from "./store";

const A = "0b5e8a3c-1f2d-4c5b-9a7e-3d2c1b0a9f8e";
const B = "1c6f9b4d-2a3e-4d6c-8b8f-4e3d2c1b0a9f";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const body = (s: string) => new Response(s).body as ReadableStream<Uint8Array>;
const pin = (slug: string, hashes: string[]): Pin => ({ slug, title: slug, hashes, bytes: 0, savedAt: "t", syncedAt: "t" });

let root: string;
let store: Store;
beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "store-"));
  store = new Store(root);
  await store.init();
});

describe("pickVictims", () => {
  const files = [
    { hash: "old", size: 40, mtimeMs: 1 },
    { hash: "pinned", size: 40, mtimeMs: 0 },
    { hash: "new", size: 40, mtimeMs: 3 },
  ];
  it("drops the oldest unpinned until the total fits", () => {
    expect(pickVictims(files, new Set(["pinned"]), 80)).toEqual(["old"]);
  });
  it("never picks a pinned file, even over the limit", () => {
    expect(pickVictims(files, new Set(["pinned"]), 0)).toEqual(["old", "new"]);
  });
  it("picks nothing under the limit", () => {
    expect(pickVictims(files, new Set(), 1000)).toEqual([]);
  });
});

describe("Store", () => {
  it("writes a blob that hashes to its name and reads it back with its type", async () => {
    const h = sha("hello");
    expect(await store.writeBlob(A, h, "model/gltf-binary", body("hello"))).toBe(5);
    expect(await store.blob(A, h)).toMatchObject({ size: 5, type: "model/gltf-binary" });
  });

  it("a body that does not hash to its name is refused and leaves nothing behind", async () => {
    const h = sha("hello");
    await expect(store.writeBlob(A, h, "x", body("tampered"))).rejects.toThrow(/did not hash/);
    expect(await store.blob(A, h)).toBeNull();
    expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
  });

  it("a failed write leaves nothing behind", async () => {
    const h = sha("hello");
    const broken = new ReadableStream<Uint8Array>({ pull(c) { c.error(Object.assign(new Error("disk full"), { code: "ENOSPC" })); } });
    await expect(store.writeBlob(A, h, "x", broken)).rejects.toMatchObject({ code: "ENOSPC" });
    expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
    expect(await store.blob(A, h)).toBeNull();
  });

  it("keeps each user's blobs and snapshots apart", async () => {
    const h = sha("a");
    await store.writeBlob(A, h, "x", body("a"));
    await store.writeSnapshot(A, "/api/auth/me", { status: 200, headers: [["content-type", "application/json"]] }, Buffer.from("{}"));
    expect(await store.blob(B, h)).toBeNull();
    expect(await store.readSnapshot(B, "/api/auth/me")).toBeNull();
    expect((await store.readSnapshot(A, "/api/auth/me"))?.meta.status).toBe(200);
  });

  it("refuses a user id or hash that could leave its directory", async () => {
    await expect(store.blob("../x", sha("a"))).rejects.toThrow(/refusing user/);
    await expect(store.blob(A, "../../etc/passwd")).rejects.toThrow(/refusing hash/);
  });

  it("clears tmp/ on init", async () => {
    const h = sha("a");
    await store.writeBlob(A, h, "x", body("a"));
    await new Store(root).init();
    expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
  });

  it("evicts unpinned blobs only and reports usage", async () => {
    const keep = sha("keep-me");
    const drop = sha("drop-me");
    await store.writeBlob(A, keep, "x", body("keep-me"));
    await store.writeBlob(A, drop, "x", body("drop-me"));
    await store.updatePins(A, () => [pin("t", [keep])]);
    expect(await store.usage(A)).toEqual({ used: 14, pinned: 7 });
    await store.evict(A, 0);
    expect(await store.blob(A, keep)).not.toBeNull();
    expect(await store.blob(A, drop)).toBeNull();
  });

  it("serialises pin updates", async () => {
    await Promise.all([
      store.updatePins(A, (p) => [...p, pin("one", [])]),
      store.updatePins(A, (p) => [...p, pin("two", [])]),
    ]);
    expect((await store.readPins(A)).map((p) => p.slug).sort()).toEqual(["one", "two"]);
  });
});
