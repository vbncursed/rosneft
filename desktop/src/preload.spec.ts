import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://andrey.vbncursed.fun";

async function load(page: { origin: string; top: boolean }) {
  vi.resetModules();
  const expose = vi.fn();
  vi.doMock("electron", () => ({
    contextBridge: { exposeInMainWorld: expose },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  }));
  const win: { top?: unknown } = {};
  win.top = page.top ? win : {};
  vi.stubGlobal("window", win);
  vi.stubGlobal("location", { origin: page.origin });
  vi.stubGlobal("process", { ...process, argv: [...process.argv, `--andrey-origin=${ORIGIN}`, "--andrey-passkeys=0"] });
  await import("./preload.js");
  return expose;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("electron");
});

describe("preload gate", () => {
  it("exposes window.desktop once to the own origin's top window", async () => {
    const expose = await load({ origin: ORIGIN, top: true });
    expect(expose).toHaveBeenCalledOnce();
    expect(expose.mock.calls[0]![0]).toBe("desktop");
  });
  it("exposes nothing to another origin", async () => {
    expect(await load({ origin: "https://evil.example", top: true })).not.toHaveBeenCalled();
  });
  it("exposes nothing to a frame that is not the top window", async () => {
    expect(await load({ origin: ORIGIN, top: false })).not.toHaveBeenCalled();
  });
});

describe("preload import boundary", () => {
  it("imports only electron at runtime", () => {
    const src = readFileSync(path.join(__dirname, "preload.ts"), "utf8");
    const imports = [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gmsu)].map((m) => m[1]);
    expect(imports).toEqual(["electron"]);
    // no side-effect import, require() or dynamic import() sneaking a second module in
    expect(src).not.toMatch(/^import\s+"/mu);
    expect(src).not.toMatch(/\brequire\s*\(|\bimport\s*\(/u);
  });
});
