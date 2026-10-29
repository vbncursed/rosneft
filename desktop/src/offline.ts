import { assertDeclaredWithin, eachLimit } from "./limit";
import type { Progress, SavedTerritory } from "./ipc-contract";
import type { SettingsFile } from "./settings";
import type { Pin, Store } from "./store";
import { checked, Gone, reasonOf, SaveFailure, SessionChanged, throttled } from "./offline-errors";
import { sceneHashes, type SceneLike } from "./offline-scene";
import { Semaphore } from "./semaphore";

export { sceneHashes, type SceneLike };

export type SaverDeps = {
  origin: string;
  fetch: (url: string, signal?: AbortSignal) => Promise<Response>;
  store: Store;
  settings: SettingsFile;
  emit: (p: Progress) => void;
  now?: () => Date;
};

const upsert = (pins: Pin[], pin: Pin): Pin[] => [...pins.filter((p) => p.slug !== pin.slug), pin];

const SAVES_AT_ONCE = 2;
const DOWNLOADS_AT_ONCE = 4;

export class OfflineSaver {
  private readonly jobs = new Map<string, { promise: Promise<void>; abort: AbortController }>();
  private readonly slots = new Semaphore(SAVES_AT_ONCE);

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

  private async unpin(user: string, slug: string): Promise<Pin | undefined> {
    let removed: Pin | undefined;
    await this.d.store.updatePins(user, (all) => {
      removed = all.find((p) => p.slug === slug);
      return all.filter((p) => p.slug !== slug);
    });
    if (removed) await this.d.store.removeUnpinned(user, removed.hashes);
    return removed;
  }

  /** Access is gone: drop the copy (answers its title for the notice), then what the offline shell would still replay of it. Snapshot failures are logged only: the copy is gone either way. */
  private async drop(user: string, slug: string): Promise<string | undefined> {
    this.still(user);
    const pin = await this.unpin(user, slug);
    await Promise.all(
      [`/api/territories/${slug}`, `/api/territories/${slug}/scene`].map((key) =>
        this.d.store
          .removeSnapshot(user, key)
          .catch((e: unknown) => console.warn("offline: snapshot not removed", key, e)),
      ),
    );
    return pin?.title;
  }

  /** On every return of the network: pinned territories pick up new models and documents by themselves. */
  async resyncAll(): Promise<void> {
    const user = this.d.settings.value.userId;
    if (!user) return;
    for (const pin of await this.d.store.readPins(user)) void this.save(pin.slug, true);
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
      await this.slots.acquire(signal);
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
          assertDeclaredWithin(res.headers, this.d.settings.value.limit, `blob ${hash}`);
          this.still(user);
          // Await first: `bytes += await …` reads bytes before the suspension and loses concurrent downloads' sizes.
          const size = await store.writeBlob(
            user,
            hash,
            res.headers.get("content-type") ?? "application/octet-stream",
            res.body,
            signal,
            this.d.settings.value.limit,
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
          const title = await this.drop(user, slug);
          return this.d.emit({ slug, state: "gone", done: 0, total: 0, title });
        } catch (dropErr) {
          if (dropErr instanceof SessionChanged) return emit({ slug, state: "cancelled", done: 0, total: 0 });
          console.warn("offline: could not drop", slug, dropErr);
        }
      }
      if (signal.aborted || err instanceof SessionChanged) emit({ slug, state: "cancelled", done: 0, total: 0 });
      else if (silent) console.warn("offline: resync failed", slug, err);
      else emit({ slug, state: "failed", done: 0, total: 0, error: reasonOf(err) });
    } finally {
      this.slots.release();
    }
  }
}
