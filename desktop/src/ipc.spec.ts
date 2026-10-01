import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildHandlers, registerIpc, senderAllowed, type IpcEventLike } from "./ipc";
import { SettingsFile } from "./settings";
import { Store } from "./store";
import { LIMITS } from "./validate";

const ORIGIN = "https://andrey.vbncursed.fun";
const A = "0b5e8a3c-1f2d-4c5b-9a7e-3d2c1b0a9f8e";

async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "ipc-"));
  const settings = new SettingsFile(path.join(root, "settings.json"));
  await settings.update({ userId: A });
  const store = new Store(path.join(root, "cache"));
  await store.init();
  const saver = { list: vi.fn(async () => []), save: vi.fn(async () => {}), cancel: vi.fn(), remove: vi.fn(async () => {}) };
  const registered = new Map<string, (event: IpcEventLike, ...args: unknown[]) => unknown>();
  registerIpc({ handle: (c, fn) => registered.set(c, fn) }, ORIGIN, buildHandlers({ saver, store, settings }));
  const main = { url: `${ORIGIN}/territories` };
  const event = (frame = main, top = main): IpcEventLike => ({ senderFrame: frame, sender: { mainFrame: top } });
  const call = (channel: string, ev: IpcEventLike, ...args: unknown[]) => Promise.resolve(registered.get(channel)!(ev, ...args));
  return { saver, settings, call, event, main, registered };
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
    expect([...s.registered.keys()].sort()).toEqual([
      "offline:cancel", "offline:list", "offline:remove", "offline:save", "storage:clear", "storage:set-limit", "storage:usage",
    ]);
  });

  it("refuses a call from a frame, even a same-origin one", async () => {
    const s = await setup();
    const iframe = { url: `${ORIGIN}/pdfjs/web/viewer.html` };
    await expect(s.call("offline:save", s.event(iframe, s.main), "ust-kut")).rejects.toThrow(/refused/);
    expect(s.saver.save).not.toHaveBeenCalled();
  });

  it("refuses a slug that is not one", async () => {
    const s = await setup();
    await expect(s.call("offline:save", s.event(), "../../etc")).rejects.toThrow(/arguments/);
    await expect(s.call("offline:save", s.event())).rejects.toThrow(/arguments/);
  });

  it("refuses a limit outside the list", async () => {
    const s = await setup();
    await expect(s.call("storage:set-limit", s.event(), 123)).rejects.toThrow(/arguments/);
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
