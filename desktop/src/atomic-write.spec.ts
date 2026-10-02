import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite } from "./atomic-write";

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
});
