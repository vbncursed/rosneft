import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickVictims, Store, type Pin } from "./store";

const A = "0b5e8a3c-1f2d-4c5b-9a7e-3d2c1b0a9f8e";
const B = "1c6f9b4d-2a3e-4d6c-8b8f-4e3d2c1b0a9f";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const body = (s: string) => new Response(s).body as ReadableStream<Uint8Array>;
const pin = (slug: string, hashes: string[]): Pin => ({
  slug,
  title: slug,
  hashes,
  bytes: 0,
  savedAt: "t",
  syncedAt: "t",
});

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
    await expect(store.writeBlob(A, h, "x", body("tampered"))).rejects.toThrow(/did not hash/u);
    expect(await store.blob(A, h)).toBeNull();
    expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
  });

  it("a failed write leaves nothing behind", async () => {
    const h = sha("hello");
    const broken = new ReadableStream<Uint8Array>({
      pull(c) {
        c.error(Object.assign(new Error("disk full"), { code: "ENOSPC" }));
      },
    });
    await expect(store.writeBlob(A, h, "x", broken)).rejects.toMatchObject({ code: "ENOSPC" });
    expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
    expect(await store.blob(A, h)).toBeNull();
  });

  it("keeps each user's blobs and snapshots apart", async () => {
    const h = sha("a");
    await store.writeBlob(A, h, "x", body("a"));
    await store.writeSnapshot(
      A,
      "/api/auth/me",
      { status: 200, headers: [["content-type", "application/json"]] },
      Buffer.from("{}"),
    );
    expect(await store.blob(B, h)).toBeNull();
    expect(await store.readSnapshot(B, "/api/auth/me")).toBeNull();
    expect((await store.readSnapshot(A, "/api/auth/me"))?.meta.status).toBe(200);
  });

  it("refuses a user id or hash that could leave its directory", async () => {
    await expect(store.blob("../x", sha("a"))).rejects.toThrow(/refusing user/u);
    await expect(store.blob(A, "../../etc/passwd")).rejects.toThrow(/refusing hash/u);
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
    expect((await store.readPins(A)).map((p) => p.slug).toSorted()).toEqual(["one", "two"]);
  });

  it("a failed rename leaves no orphan .type and nothing in tmp/", async () => {
    const h = sha("hello");
    const blobs = path.join(root, "users", A, "blobs");
    mkdirSync(path.join(blobs, h), { recursive: true });
    await expect(store.writeBlob(A, h, "x", body("hello"))).rejects.toThrow();
    expect(readdirSync(blobs).filter((n) => n.endsWith(".type"))).toEqual([]);
    expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
  });

  it("an aborted write rejects and leaves nothing behind", async () => {
    const h = sha("hello");
    const ac = new AbortController();
    const stalled = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => {});
      },
    });
    const pending = store.writeBlob(A, h, "x", stalled, ac.signal);
    setTimeout(() => ac.abort(), 10);
    await expect(pending).rejects.toThrow();
    expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
    expect(await store.blob(A, h)).toBeNull();
  });

  it("a corrupt pins.json is an error, not an empty list", async () => {
    mkdirSync(path.join(root, "users", A), { recursive: true });
    writeFileSync(path.join(root, "users", A, "pins.json"), "{not json");
    await expect(store.readPins(A)).rejects.toThrow();
  });

  it("evict on a corrupt pins.json rejects and deletes nothing", async () => {
    const h = sha("a");
    await store.writeBlob(A, h, "x", body("a"));
    writeFileSync(path.join(root, "users", A, "pins.json"), "{not json");
    await expect(store.evict(A, 0)).rejects.toThrow();
    expect(await store.blob(A, h)).not.toBeNull();
  });

  it("evict does not delete a blob pinned while it runs", async () => {
    const x = sha("x");
    await store.writeBlob(A, x, "x", body("x"));
    await Promise.all([store.updatePins(A, () => [pin("t", [x])]), store.evict(A, 0)]);
    expect(await store.blob(A, x)).not.toBeNull();
  });

  it("removeBlobs logs and carries on when one file cannot be deleted", async () => {
    const [stuck, free] = [sha("stuck"), sha("free")];
    await store.writeBlob(A, free, "x", body("free"));
    // A directory where the blob should be: rm without recursive throws, like Windows EBUSY on a streamed file.
    mkdirSync(path.join(root, "users", A, "blobs", stuck), { recursive: true });
    writeFileSync(path.join(root, "users", A, "blobs", stuck, "x"), "x");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(store.removeBlobs(A, [stuck, free])).resolves.toBeUndefined();
    expect(await store.blob(A, free)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("removeUnpinned deletes only what no current pin holds", async () => {
    const [kept, gone] = [sha("kept"), sha("gone")];
    await store.writeBlob(A, kept, "x", body("kept"));
    await store.writeBlob(A, gone, "x", body("gone"));
    await store.updatePins(A, () => [pin("t", [kept])]);
    await store.removeUnpinned(A, [kept, gone]);
    expect(await store.blob(A, kept)).not.toBeNull();
    expect(await store.blob(A, gone)).toBeNull();
  });

  it("removeUnpinned on a corrupt pins.json rejects and deletes nothing", async () => {
    const h = sha("a");
    await store.writeBlob(A, h, "x", body("a"));
    writeFileSync(path.join(root, "users", A, "pins.json"), "{not json");
    await expect(store.removeUnpinned(A, [h])).rejects.toThrow();
    expect(await store.blob(A, h)).not.toBeNull();
  });

  it("stores a snapshot as one file and reads a garbled one as missing", async () => {
    await store.writeSnapshot(A, "/k", { status: 200, headers: [] }, Buffer.from("body"));
    const dir = path.join(root, "users", A, "snapshots");
    const [name = ""] = readdirSync(dir);
    expect(readdirSync(dir)).toHaveLength(1);
    expect((await store.readSnapshot(A, "/k"))?.body.toString()).toBe("body");
    writeFileSync(path.join(dir, name), Buffer.from([0, 0, 1]));
    expect(await store.readSnapshot(A, "/k")).toBeNull();
    writeFileSync(path.join(dir, name), Buffer.from([0, 0, 0, 99, 1, 2]));
    expect(await store.readSnapshot(A, "/k")).toBeNull();
  });

  it("removeSnapshot deletes one key and tolerates a missing one", async () => {
    await store.writeSnapshot(A, "/k", { status: 200, headers: [] }, Buffer.from("body"));
    await store.removeSnapshot(A, "/k");
    expect(await store.readSnapshot(A, "/k")).toBeNull();
    await expect(store.removeSnapshot(A, "/k")).resolves.toBeUndefined();
  });
});
