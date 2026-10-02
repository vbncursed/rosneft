import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { atomicWrite } from "./atomic-write";
import { isHash, isUserId } from "./validate";

export type SnapshotMeta = { status: number; headers: [string, string][] };
export type Pin = {
  slug: string;
  title: string;
  hashes: string[];
  bytes: number;
  savedAt: string;
  syncedAt: string | null;
};
export type BlobFile = { hash: string; size: number; mtimeMs: number };

const totalSize = (list: BlobFile[]) => list.reduce((n, f) => n + f.size, 0);

/**
 * Least-recently-*modified* first, never a pinned file. Not LRU: a cache hit
 * reads the file and leaves its mtime alone; a real LRU would need a side-index.
 */
export function pickVictims(files: BlobFile[], pinned: ReadonlySet<string>, limit: number): string[] {
  let total = totalSize(files);
  const victims: string[] = [];
  const candidates = files.filter((f) => !pinned.has(f.hash)).toSorted((a, b) => a.mtimeMs - b.mtimeMs);
  for (const f of candidates) {
    if (total <= limit) break;
    victims.push(f.hash);
    total -= f.size;
  }
  return victims;
}

export class Store {
  private pinChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly root: string) {}

  /** tmp/ is outside everything eviction sweeps; a hard kill can only orphan files there. */
  async init(): Promise<void> {
    await rm(this.tmpDir(), { recursive: true, force: true });
    await mkdir(this.tmpDir(), { recursive: true });
  }

  private tmpDir(): string {
    return path.join(this.root, "tmp");
  }

  private tmpFile(): string {
    return path.join(this.tmpDir(), randomUUID());
  }

  private userDir(user: string): string {
    if (!isUserId(user)) throw new Error(`store: refusing user id ${JSON.stringify(user)}`);
    return path.join(this.root, "users", user);
  }

  private blobPath(user: string, hash: string): string {
    if (!isHash(hash)) throw new Error(`store: refusing hash ${JSON.stringify(hash)}`);
    return path.join(this.userDir(user), "blobs", hash);
  }

  private snapshotFile(user: string, key: string): string {
    return path.join(this.userDir(user), "snapshots", createHash("sha256").update(key).digest("hex"));
  }

  /** One file per key — [4-byte meta length][meta JSON][body] — so a body can never be paired with another response's headers. */
  async readSnapshot(user: string, key: string): Promise<{ meta: SnapshotMeta; body: Buffer } | null> {
    try {
      const data = await readFile(this.snapshotFile(user, key));
      const metaEnd = 4 + data.readUInt32BE(0);
      if (metaEnd > data.length) return null;
      return {
        meta: JSON.parse(data.subarray(4, metaEnd).toString("utf8")) as SnapshotMeta,
        body: data.subarray(metaEnd),
      };
    } catch {
      return null;
    }
  }

  async writeSnapshot(user: string, key: string, meta: SnapshotMeta, body: Buffer): Promise<void> {
    const json = Buffer.from(JSON.stringify(meta));
    const head = Buffer.alloc(4);
    head.writeUInt32BE(json.length);
    await atomicWrite(this.snapshotFile(user, key), Buffer.concat([head, json, body]), this.tmpFile());
  }

  async blob(user: string, hash: string): Promise<{ path: string; size: number; type: string } | null> {
    const file = this.blobPath(user, hash);
    try {
      const [s, type] = await Promise.all([stat(file), readFile(`${file}.type`, "utf8")]);
      return { path: file, size: s.size, type };
    } catch {
      return null;
    }
  }

  /** Streams into tmp/, checks the bytes hash to `hash`, renames into blobs/. Throws on any failure; nothing is left behind. */
  async writeBlob(
    user: string,
    hash: string,
    type: string,
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ): Promise<number> {
    const dest = this.blobPath(user, hash);
    const tmp = this.tmpFile();
    const digest = createHash("sha256");
    let size = 0;
    const count = new Transform({
      transform(chunk: Buffer, _enc, done) {
        digest.update(chunk);
        size += chunk.length;
        done(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(body as NodeWebStream<Uint8Array>), count, createWriteStream(tmp), { signal });
      if (digest.digest("hex") !== hash) throw new Error(`store: ${hash} did not hash to itself`);
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(tmp, dest);
      await atomicWrite(`${dest}.type`, type, this.tmpFile());
      return size;
    } finally {
      await rm(tmp, { force: true });
    }
  }

  async blobFiles(user: string): Promise<BlobFile[]> {
    const dir = path.join(this.userDir(user), "blobs");
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const files = await Promise.all(
      names.filter(isHash).map(async (hash) => {
        try {
          const s = await stat(path.join(dir, hash));
          return { hash, size: s.size, mtimeMs: s.mtimeMs };
        } catch {
          return null;
        }
      }),
    );
    return files.filter((f): f is BlobFile => f !== null);
  }

  /** One locked file (Windows EBUSY/EPERM on a blob being streamed) is logged and skipped, never a rejected batch. */
  async removeBlobs(user: string, hashes: Iterable<string>): Promise<void> {
    await Promise.all(
      [...hashes].map(async (hash) => {
        const file = this.blobPath(user, hash);
        try {
          await rm(file, { force: true });
          await rm(`${file}.type`, { force: true });
        } catch (err) {
          console.warn("store: could not remove blob", hash, err);
        }
      }),
    );
  }

  /** Deletes the hashes no pin holds *now*: pins are re-read inside the serialiser that `updatePins` and `evict` share, so a save pinning one in the meantime keeps it. */
  removeUnpinned(user: string, hashes: Iterable<string>): Promise<void> {
    return this.serialised(async () => {
      const held = new Set((await this.readPins(user)).flatMap((p) => p.hashes));
      await this.removeBlobs(
        user,
        [...hashes].filter((h) => !held.has(h)),
      );
    });
  }

  async readPins(user: string): Promise<Pin[]> {
    try {
      return JSON.parse(await readFile(path.join(this.userDir(user), "pins.json"), "utf8")) as Pin[];
    } catch (err) {
      // Anything but "no file yet" (corrupt JSON, EACCES) must not read as "no pins": eviction would delete pinned blobs.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  /** Pin writes and eviction share one queue: a pin landing between evict's read and its delete must not lose its blob. */
  private serialised<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pinChain.then(task);
    this.pinChain = next.catch(() => undefined);
    return next;
  }

  /** Read-modify-write, one at a time: two saves finishing together must not drop each other's pin. */
  updatePins(user: string, change: (pins: Pin[]) => Pin[]): Promise<Pin[]> {
    return this.serialised(async () => {
      const pins = change(await this.readPins(user));
      await atomicWrite(path.join(this.userDir(user), "pins.json"), JSON.stringify(pins), this.tmpFile());
      return pins;
    });
  }

  async usage(user: string): Promise<{ used: number; pinned: number }> {
    const [files, pins] = await Promise.all([this.blobFiles(user), this.readPins(user)]);
    const pinned = new Set(pins.flatMap((p) => p.hashes));
    return { used: totalSize(files), pinned: totalSize(files.filter((f) => pinned.has(f.hash))) };
  }

  evict(user: string, limit: number): Promise<void> {
    return this.serialised(async () => {
      const [files, pins] = await Promise.all([this.blobFiles(user), this.readPins(user)]);
      await this.removeBlobs(user, pickVictims(files, new Set(pins.flatMap((p) => p.hashes)), limit));
    });
  }
}
