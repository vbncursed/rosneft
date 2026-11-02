import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { atomicWrite } from "./atomic-write";

const log: string[] = [];
vi.mock("node:fs/promises", async (orig) => {
  const real = await orig<typeof import("node:fs/promises")>();
  return {
    ...real,
    rename: (a: string, b: string) => (log.push(`rename ${path.basename(b)}`), real.rename(a, b)),
    open: async (p: string, ...rest: [string?]) => {
      const fh = await real.open(p, ...rest);
      const tag = path.basename(p);
      return new Proxy(fh, {
        get(t, k) {
          const v = Reflect.get(t, k) as unknown;
          if (k !== "sync" || typeof v !== "function") return typeof v === "function" ? v.bind(t) : v;
          return async () => (log.push(`sync ${tag}`), (v as () => Promise<void>).call(t));
        },
      });
    },
  };
});

const dir = () => mkdtempSync(path.join(tmpdir(), "atomic-"));

describe("atomicWrite", () => {
  it("creates the destination's directory and leaves only the file", async () => {
    const d = dir();
    await atomicWrite(path.join(d, "a", "b.txt"), "hello");
    expect(readFileSync(path.join(d, "a", "b.txt"), "utf8")).toBe("hello");
    expect(readdirSync(path.join(d, "a"))).toEqual(["b.txt"]);
  });
  it("writes through the tmp path it is given", async () => {
    const d = dir();
    const tmp = path.join(d, "stage");
    await atomicWrite(path.join(d, "x"), "1", tmp);
    expect(readdirSync(d).toSorted()).toEqual(["x"]);
  });
  it("removes its tmp file when the rename fails", async () => {
    const d = dir();
    const dest = path.join(d, "dest");
    mkdirSync(dest);
    writeFileSync(path.join(dest, "keep"), "x");
    await expect(atomicWrite(dest, "data")).rejects.toThrow();
    expect(readdirSync(d)).toEqual(["dest"]);
  });
  it("syncs the data before the rename and the directory after it", async () => {
    const d = dir();
    log.length = 0;
    await atomicWrite(path.join(d, "pins.json"), "[]");
    const at = (e: string) => log.findIndex((l) => l === e);
    const dirName = `sync ${path.basename(d)}`;
    expect(log.findIndex((l) => l.startsWith("sync pins.json."))).toBeGreaterThanOrEqual(0);
    expect(at("rename pins.json")).toBeGreaterThan(log.findIndex((l) => l.startsWith("sync pins.json.")));
    expect(at(dirName)).toBeGreaterThan(at("rename pins.json"));
  });
});
