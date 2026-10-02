import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHandlers, registerIpc, senderAllowed, type IpcEventLike } from "./ipc";
import { SettingsFile } from "./settings";
import { Store } from "./store";
import { LIMITS } from "./validate";

const ORIGIN = "https://andrey.vbncursed.fun";
const A = "0b5e8a3c-1f2d-4c5b-9a7e-3d2c1b0a9f8e";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "ipc-"));
  roots.push(root);
  const settings = new SettingsFile(path.join(root, "settings.json"));
  await settings.update({ userId: A });
  const store = new Store(path.join(root, "cache"));
  await store.init();
  const saver = {
    list: vi.fn(async () => []),
    save: vi.fn((_slug: string): Promise<void> => new Promise(() => {})),
    cancel: vi.fn(),
    remove: vi.fn(async () => {}),
  };
  const online = { value: false };
  const registered = new Map<string, (event: IpcEventLike, ...args: unknown[]) => unknown>();
  registerIpc(
    { handle: (c, fn) => registered.set(c, fn) },
    ORIGIN,
    buildHandlers({ saver, store, settings, connectivity: () => online.value }),
  );
  const main = { url: `${ORIGIN}/territories`, parent: null, detached: false };
  const event = (frame: IpcEventLike["senderFrame"] = main): IpcEventLike => ({ senderFrame: frame });
  const call = (channel: string, ev: IpcEventLike, ...args: unknown[]) =>
    Promise.resolve(registered.get(channel)!(ev, ...args));
  return { saver, store, online, settings, call, event, main, registered };
}

describe("senderAllowed", () => {
  it("lets only the upstream's main frame in", () => {
    expect(senderAllowed(`${ORIGIN}/`, true, ORIGIN)).toBe(true);
    expect(senderAllowed(`${ORIGIN}/pdfjs/web/viewer.html`, false, ORIGIN)).toBe(false);
    expect(senderAllowed("https://evil.example/", true, ORIGIN)).toBe(false);
    expect(senderAllowed(undefined, true, ORIGIN)).toBe(false);
  });
});

describe("registerIpc", () => {
  it("registers every channel of the contract", async () => {
    const s = await setup();
    expect([...s.registered.keys()].toSorted()).toEqual([
      "connectivity:get",
      "offline:cancel",
      "offline:list",
      "offline:remove",
      "offline:save",
      "storage:clear",
      "storage:set-limit",
      "storage:usage",
    ]);
  });

  it("refuses a call from a frame, even a same-origin one", async () => {
    const s = await setup();
    const iframe = { url: `${ORIGIN}/pdfjs/web/viewer.html`, parent: s.main, detached: false };
    await expect(s.call("offline:save", s.event(iframe), "ust-kut")).rejects.toThrow(/refused/u);
    expect(s.saver.save).not.toHaveBeenCalled();
  });

  it("refuses an off-origin main frame, a detached one and a destroyed one", async () => {
    const s = await setup();
    const evil = { url: "https://evil.example/", parent: null, detached: false };
    await expect(s.call("offline:save", s.event(evil), "ust-kut")).rejects.toThrow(/refused/u);
    await expect(s.call("offline:save", s.event({ ...s.main, detached: true }), "ust-kut")).rejects.toThrow(/refused/u);
    await expect(s.call("offline:save", s.event(null), "ust-kut")).rejects.toThrow(/refused/u);
    expect(s.saver.save).not.toHaveBeenCalled();
  });

  it("answers connectivity:get with the dependency's value and takes no arguments", async () => {
    const s = await setup();
    expect(await s.call("connectivity:get", s.event())).toBe(false);
    s.online.value = true;
    expect(await s.call("connectivity:get", s.event())).toBe(true);
    await expect(s.call("connectivity:get", s.event(), 1)).rejects.toThrow(/arguments/u);
  });

  it("checks the arguments of cancel and remove and forwards good ones", async () => {
    const s = await setup();
    for (const c of ["offline:cancel", "offline:remove"]) {
      await expect(s.call(c, s.event(), "../x")).rejects.toThrow(/arguments/u);
      await expect(s.call(c, s.event())).rejects.toThrow(/arguments/u);
    }
    await s.call("offline:cancel", s.event(), "ust-kut");
    await s.call("offline:remove", s.event(), "ust-kut");
    expect(s.saver.cancel).toHaveBeenCalledWith("ust-kut");
    expect(s.saver.remove).toHaveBeenCalledWith("ust-kut");
  });

  it("clears the cache through the store", async () => {
    const s = await setup();
    const evict = vi.spyOn(s.store, "evict");
    await s.call("storage:clear", s.event());
    expect(evict).toHaveBeenCalledWith(A, 0);
    await expect(s.call("storage:clear", s.event(), 1)).rejects.toThrow(/arguments/u);
  });

  it("refuses a slug that is not one", async () => {
    const s = await setup();
    await expect(s.call("offline:save", s.event(), "../../etc")).rejects.toThrow(/arguments/u);
    await expect(s.call("offline:save", s.event())).rejects.toThrow(/arguments/u);
  });

  it("refuses a limit outside the list", async () => {
    const s = await setup();
    await expect(s.call("storage:set-limit", s.event(), 123)).rejects.toThrow(/arguments/u);
    await s.call("storage:set-limit", s.event(), LIMITS[0]);
    expect(s.settings.value.limit).toBe(LIMITS[0]);
  });

  it("queues a save without waiting for it", async () => {
    const s = await setup();
    await s.call("offline:save", s.event(), "ust-kut");
    expect(s.saver.save).toHaveBeenCalledWith("ust-kut");
  });

  it("reports usage with the current limit", async () => {
    const s = await setup();
    expect(await s.call("storage:usage", s.event())).toEqual({ used: 0, pinned: 0, limit: s.settings.value.limit });
  });
});
