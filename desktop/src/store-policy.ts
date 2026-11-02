import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isUserId } from "./validate";

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

export const totalSize = (list: BlobFile[]) => list.reduce((n, f) => n + f.size, 0);

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

/**
 * Design choice, not a spec: a user directory idle this long is plaintext on disk for nobody's benefit and
 * counts toward disk use, so the next start removes it. Their next sign-in just re-caches.
 */
export const USER_RETENTION_MS = 30 * 86_400_000;

/** Other users' directories idle past retention. Unknown current user (`keep` null) keeps everything: fail safe. */
export function staleUserDirs(
  entries: { name: string; mtimeMs: number }[],
  now: number,
  keep: string | null,
): string[] {
  if (keep === null) return [];
  return entries
    .filter((e) => isUserId(e.name) && e.name !== keep && now - e.mtimeMs > USER_RETENTION_MS)
    .map((e) => e.name);
}

/** The directory's own mtime or its direct children's (pins.json, blobs/, snapshots/), whichever is newest; Infinity on error keeps it. */
export async function newestMtime(dir: string): Promise<number> {
  try {
    const kids = await readdir(dir);
    const times = await Promise.all(
      [dir, ...kids.map((k) => path.join(dir, k))].map(async (p) => (await stat(p)).mtimeMs),
    );
    return Math.max(...times);
  } catch {
    return Infinity;
  }
}
