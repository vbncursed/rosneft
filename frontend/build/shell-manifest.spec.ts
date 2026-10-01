import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFEST, writeShellManifest } from "./shell-manifest.ts";

const dist = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dist-"));
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "index.html"), "<html>");
  writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
  return dir;
};
const read = (dir: string) => JSON.parse(readFileSync(path.join(dir, MANIFEST), "utf8"));

describe("writeShellManifest", () => {
  it("lists every file from the web root with its size", () => {
    const dir = dist();
    writeShellManifest(dir);
    expect(read(dir).files).toEqual([
      { path: "/assets/app.js", size: 14 },
      { path: "/index.html", size: 6 },
    ]);
  });
  it("never lists itself, even on a second run", () => {
    const dir = dist();
    writeShellManifest(dir);
    writeShellManifest(dir);
    expect(read(dir).files.map((f: { path: string }) => f.path)).not.toContain(`/${MANIFEST}`);
  });
  it("changes its id when any file changes, and only then", () => {
    const dir = dist();
    writeShellManifest(dir);
    const first = read(dir).id;
    writeShellManifest(dir);
    expect(read(dir).id).toBe(first);
    writeFileSync(path.join(dir, "assets", "app.js"), "console.log(2)");
    writeShellManifest(dir);
    expect(read(dir).id).not.toBe(first);
    expect(read(dir).id).toMatch(/^[0-9a-f]{32}$/);
  });
  it("skips dotfiles and dot directories, and they do not affect the id", () => {
    const dir = dist();
    writeShellManifest(dir);
    const first = read(dir).id;
    writeFileSync(path.join(dir, ".DS_Store"), "x");
    mkdirSync(path.join(dir, ".hidden"));
    writeFileSync(path.join(dir, ".hidden", "x"), "x");
    writeShellManifest(dir);
    expect(read(dir).files.map((f: { path: string }) => f.path)).toEqual(["/assets/app.js", "/index.html"]);
    expect(read(dir).id).toBe(first);
  });
  it("deletes .DS_Store at any depth and leaves other dotfiles in place", () => {
    const dir = dist();
    writeFileSync(path.join(dir, ".DS_Store"), "x");
    writeFileSync(path.join(dir, "assets", ".DS_Store"), "x");
    writeFileSync(path.join(dir, ".keep"), "x");
    writeShellManifest(dir);
    expect(existsSync(path.join(dir, ".DS_Store"))).toBe(false);
    expect(existsSync(path.join(dir, "assets", ".DS_Store"))).toBe(false);
    expect(existsSync(path.join(dir, ".keep"))).toBe(true);
    expect(read(dir).files).toHaveLength(2);
  });
});
