import { eachLimit } from "./limit";
import type { Progress, SavedTerritory, SaveError } from "./ipc-contract";
import type { SettingsFile } from "./settings";
import type { Pin, Store } from "./store";
import { isHash } from "./validate";

type Hashed = { hash: string };
export type SceneLike = {
  territory: { slug: string; title: string };
  artifact?: Hashed & { artifacts?: Hashed[] };
  placements: { modelSlug: string }[];
  modelOptions: { slug: string; thumbnailBlobHash?: string; artifacts: Hashed[] }[];
  panoramas?: { sourceBlobHash: string; thumbnailBlobHash?: string }[];
  documents?: { sourceBlobHash: string }[];
};

/** Everything the viewer fetches from /api/assets for this territory: every LOD (the level follows screen size), placed models only. */
export function sceneHashes(scene: SceneLike): string[] {
  const placed = new Set(scene.placements.map((p) => p.modelSlug));
  const all = [
    scene.artifact?.hash,
    ...(scene.artifact?.artifacts ?? []).map((a) => a.hash),
    ...scene.modelOptions.flatMap((m) =>
      placed.has(m.slug) ? [m.thumbnailBlobHash, ...m.artifacts.map((a) => a.hash)] : [],
    ),
    ...(scene.panoramas ?? []).flatMap((p) => [p.sourceBlobHash, p.thumbnailBlobHash]),
    ...(scene.documents ?? []).map((d) => d.sourceBlobHash),
  ];
  return [...new Set(all.filter(isHash))];
}

export type SaverDeps = {
  origin: string;
  fetch: (url: string, signal?: AbortSignal) => Promise<Response>;
  store: Store;
  settings: SettingsFile;
  emit: (p: Progress) => void;
  now?: () => Date;
};

class SaveFailure extends Error {
  constructor(readonly reason: SaveError) {
    super(reason);
  }
}

/** The server no longer knows the territory (404). Only a resync of a synced copy acts on it. */
class Gone extends Error {}

/** The signed-in user is no longer the one this save started for. */
class SessionChanged extends Error {}

function reasonOf(err: unknown): SaveError {
  if (err instanceof SaveFailure) return err.reason;
  if ((err as { code?: unknown })?.code === "ENOSPC") return "no-space";
  if (String((err as { message?: unknown })?.message).includes("net::ERR")) return "network";
  return "failed";
}

function throttled(emit: (p: Progress) => void, ms: number) {
  let last = 0;
  return (p: Progress) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    emit(p);
  };
}

function checked(res: Response): Response {
  if (res.status === 401) throw new SaveFailure("signed-out");
  if (res.status !== 200) throw new SaveFailure("failed");
  return res;
}

const upsert = (pins: Pin[], pin: Pin): Pin[] => [...pins.filter((p) => p.slug !== pin.slug), pin];

const SAVES_AT_ONCE = 2;
const DOWNLOADS_AT_ONCE = 4;

export class OfflineSaver {
  private readonly jobs = new Map<string, { promise: Promise<void>; abort: AbortController }>();
  private free = SAVES_AT_ONCE;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly d: SaverDeps) {}

  /** `silent`: a resync of a saved copy — only the final `saved` is emitted, so the list re-reads and nothing flashes. */
  save(slug: string, silent = false): Promise<void> {
    const running = this.jobs.get(slug);
    if (running) return running.promise;
    const abort = new AbortController();
    const promise = this.run(slug, abort.signal, this.d.settings.value.userId, silent).finally(() =>
      this.jobs.delete(slug),
    );
    this.jobs.set(slug, { promise, abort });
    return promise;
  }

  cancel(slug: string): void {
    this.jobs.get(slug)?.abort.abort();
  }

  /** A session reset: nothing running or queued may go on with the next session's cookie. */
  cancelAll(): void {
    for (const slug of this.jobs.keys()) this.cancel(slug);
  }

  /** Called before every write: a save belongs to the user it started for. */
  private still(user: string): void {
    if (this.d.settings.value.userId !== user) throw new SessionChanged();
  }

  async list(): Promise<SavedTerritory[]> {
    const user = this.d.settings.value.userId;
    if (!user) return [];
    return (await this.d.store.readPins(user)).flatMap(({ slug, title, bytes, savedAt, syncedAt }) =>
      syncedAt ? [{ slug, title, bytes, savedAt, syncedAt }] : [],
    );
  }

  async remove(slug: string): Promise<void> {
    // save() never rejects; waiting for it means a commit already under way lands before the unpin, not after.
    const job = this.jobs.get(slug);
    this.cancel(slug);
    await job?.promise;
    const user = this.d.settings.value.userId;
    if (!user) return;
    await this.unpin(user, slug);
  }

  private async unpin(user: string, slug: string): Promise<void> {
    let removed: Pin | undefined;
    await this.d.store.updatePins(user, (all) => {
      removed = all.find((p) => p.slug === slug);
      return all.filter((p) => p.slug !== slug);
    });
    if (removed) await this.d.store.removeUnpinned(user, removed.hashes);
  }

  /** Access is gone: drop the copy, then what the offline shell would still replay of it. Snapshot failures are logged only: the copy is gone either way. */
  private async drop(user: string, slug: string): Promise<void> {
    this.still(user);
    await this.unpin(user, slug);
    await Promise.all(
      [`/api/territories/${slug}`, `/api/territories/${slug}/scene`].map((key) =>
        this.d.store
          .removeSnapshot(user, key)
          .catch((e: unknown) => console.warn("offline: snapshot not removed", key, e)),
      ),
    );
  }

  /** On every return of the network: pinned territories pick up new models and documents by themselves. */
  async resyncAll(): Promise<void> {
    const user = this.d.settings.value.userId;
    if (!user) return;
    for (const pin of await this.d.store.readPins(user)) void this.save(pin.slug, true);
  }

  /** Rejects on abort without taking a slot: a cancelled queued save must not wait for one. */
  private acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.free > 0) {
      this.free -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const turn = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        this.waiting.splice(this.waiting.indexOf(turn), 1);
        reject(signal.reason);
      };
      this.waiting.push(turn);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.free += 1;
  }

  /** Only a fetch that throws is a network failure; anything else that throws is our own. */
  private async get(url: string, signal: AbortSignal): Promise<Response> {
    try {
      return await this.d.fetch(url, signal);
    } catch {
      throw new SaveFailure("network");
    }
  }

  private async json<T>(user: string, key: string, signal: AbortSignal): Promise<T> {
    const got = await this.get(`${this.d.origin}${key}`, signal);
    if (got.status === 404) throw new Gone();
    const res = checked(got);
    const body = Buffer.from(await res.arrayBuffer());
    this.still(user);
    const headers = [...res.headers].filter(([k]) => k === "content-type" || k === "etag");
    await this.d.store.writeSnapshot(user, key, { status: 200, headers }, body);
    return JSON.parse(body.toString("utf8")) as T;
  }

  private async run(slug: string, signal: AbortSignal, user: string | null, silent: boolean): Promise<void> {
    const { store } = this.d;
    const emit = (p: Progress) => {
      if (!silent || p.state === "saved") this.d.emit(p);
    };
    const report = throttled(emit, 250);
    emit({ slug, state: "queued", done: 0, total: 0 });
    try {
      await this.acquire(signal);
    } catch {
      return emit({ slug, state: "cancelled", done: 0, total: 0 });
    }
    let before: Pin | undefined;
    try {
      signal.throwIfAborted();
      // A save queued for one account must not write into another's store.
      if (this.d.settings.value.userId !== user) return emit({ slug, state: "cancelled", done: 0, total: 0 });
      if (!user) throw new SaveFailure("signed-out");
      before = (await store.readPins(user)).find((p) => p.slug === slug);
      const scene = await this.json<SceneLike>(user, `/api/territories/${slug}/scene`, signal);
      await this.json(user, `/api/territories/${slug}`, signal);
      const hashes = sceneHashes(scene);
      const now = (this.d.now ?? (() => new Date()))().toISOString();
      const title = scene.territory.title;
      // Pinned before the first byte: eviction must not take a blob this save just wrote.
      this.still(user);
      await store.updatePins(user, (pins) =>
        upsert(pins, {
          slug,
          title,
          hashes: [...new Set([...(before?.hashes ?? []), ...hashes])],
          bytes: before?.bytes ?? 0,
          savedAt: before?.savedAt ?? now,
          syncedAt: before?.syncedAt ?? null,
        }),
      );

      let done = 0;
      let bytes = 0;
      report({ slug, state: "saving", done, total: hashes.length });
      await eachLimit(hashes, DOWNLOADS_AT_ONCE, async (hash) => {
        signal.throwIfAborted();
        const have = await store.blob(user, hash);
        if (have) {
          bytes += have.size;
        } else {
          const res = checked(await this.get(`${this.d.origin}/api/assets/${hash}`, signal));
          if (!res.body) throw new SaveFailure("failed");
          this.still(user);
          // Await first: `bytes += await …` reads bytes before the suspension and loses concurrent downloads' sizes.
          const size = await store.writeBlob(
            user,
            hash,
            res.headers.get("content-type") ?? "application/octet-stream",
            res.body,
            signal,
          );
          bytes += size;
        }
        done += 1;
        report({ slug, state: "saving", done, total: hashes.length });
      });

      this.still(user);
      await store.updatePins(user, (all) =>
        upsert(all, { slug, title, hashes, bytes, savedAt: before?.savedAt ?? now, syncedAt: now }),
      );
      await store.removeUnpinned(user, before?.hashes ?? []);
      await store
        .evict(user, this.d.settings.value.limit)
        .catch((e: unknown) => console.warn("offline: evict failed", e));
      emit({ slug, state: "saved", done: hashes.length, total: hashes.length });
    } catch (err) {
      // A first save that never finished leaves no pin; a failed resync keeps the copy it had.
      if (user && !before?.syncedAt)
        await store.updatePins(user, (all) => all.filter((p) => p.slug !== slug)).catch(() => undefined);
      if (err instanceof Gone && before?.syncedAt && user && !signal.aborted) {
        try {
          await this.drop(user, slug);
          return this.d.emit({ slug, state: "gone", done: 0, total: 0 });
        } catch (dropErr) {
          if (dropErr instanceof SessionChanged) return emit({ slug, state: "cancelled", done: 0, total: 0 });
          console.warn("offline: could not drop", slug, dropErr);
        }
      }
      if (signal.aborted || err instanceof SessionChanged) emit({ slug, state: "cancelled", done: 0, total: 0 });
      else if (silent) console.warn("offline: resync failed", slug, err);
      else emit({ slug, state: "failed", done: 0, total: 0, error: reasonOf(err) });
    } finally {
      this.release();
    }
  }
}
