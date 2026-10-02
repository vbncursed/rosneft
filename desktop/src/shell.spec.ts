import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { contentType, parseManifest, Shell, sizeAcceptable } from "./shell";

const ORIGIN = "https://andrey.vbncursed.fun";
const ID1 = "a".repeat(32);
const ID2 = "b".repeat(32);
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });

function server(files: Record<string, string>, manifestId: string) {
  return vi.fn(async (url: string) => {
    const p = new URL(url).pathname;
    if (p === "/shell-manifest.json") {
      return json({
        id: manifestId,
        files: Object.entries(files).map(([path, body]) => ({ path, size: body.length })),
      });
    }
    const body = files[p];
    return body === undefined ? new Response("nope", { status: 404 }) : new Response(body);
  });
}
const root = () => mkdtempSync(path.join(tmpdir(), "shell-"));

describe("parseManifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(parseManifest({ id: ID1, files: [{ path: "/index.html", size: 1 }] })).toEqual({
      id: ID1,
      files: [{ path: "/index.html", size: 1 }],
    });
  });
  it("skips a path that could leave the generation", () => {
    const m = parseManifest({
      id: ID1,
      files: [
        { path: "/index.html", size: 1 },
        { path: "/../evil", size: 1 },
        { path: "relative", size: 1 },
      ],
    });
    expect(m?.files.map((f) => f.path)).toEqual(["/index.html"]);
  });
  it("refuses a manifest without index.html or with a bad id", () => {
    expect(parseManifest({ id: ID1, files: [{ path: "/a.js", size: 1 }] })).toBeNull();
    expect(parseManifest({ id: "../x", files: [{ path: "/index.html", size: 1 }] })).toBeNull();
    expect(parseManifest("<html>")).toBeNull();
  });
});

describe("parseManifest dedupe", () => {
  it("keeps the first entry of a repeated path", () => {
    const m = parseManifest({
      id: ID1,
      files: [
        { path: "/index.html", size: 1 },
        { path: "/index.html", size: 9 },
      ],
    });
    expect(m?.files).toEqual([{ path: "/index.html", size: 1 }]);
  });
});

describe("contentType", () => {
  it("names the types the SPA ships", () => {
    expect(contentType("/index.html")).toBe("text/html; charset=utf-8");
    expect(contentType("/assets/a.js")).toBe("text/javascript");
    expect(contentType("/pdfjs/web/viewer.mjs")).toBe("text/javascript");
    expect(contentType("/draco/draco_decoder.wasm")).toBe("application/wasm");
    expect(contentType("/pdfjs/cmaps/78-H.bcmap")).toBe("application/octet-stream");
  });
});

describe("sizeAcceptable", () => {
  it("lets an intermediary append to an HTML file", () => {
    expect(sizeAcceptable("/index.html", 3545, 2607)).toBe(true);
    expect(sizeAcceptable("/pdfjs/web/viewer.html", 10, 10)).toBe(true);
  });
  it("refuses a truncated HTML file", () => {
    expect(sizeAcceptable("/index.html", 2606, 2607)).toBe(false);
  });
  it("keeps the exact check for every other file", () => {
    expect(sizeAcceptable("/assets/a.js", 11, 10)).toBe(false);
    expect(sizeAcceptable("/assets/a.js", 9, 10)).toBe(false);
    expect(sizeAcceptable("/assets/a.js", 10, 10)).toBe(true);
  });
});

describe("Shell", () => {
  it("swaps the generation when a proxy appends a script to index.html", async () => {
    const dir = root();
    const appended = vi.fn(async (url: string) => {
      const p = new URL(url).pathname;
      if (p === "/shell-manifest.json") return json({ id: ID1, files: [{ path: "/index.html", size: 6 }] });
      return new Response("<html><script>cf</script>");
    });
    const shell = new Shell(dir, ORIGIN, appended);
    await shell.refresh();
    expect(readFileSync(path.join(dir, "current"), "utf8")).toBe(ID1);
    expect(await shell.file("/index.html")).toMatchObject({ size: 25 });
  });

  it("keeps the current generation when a .js file is longer than the manifest", async () => {
    const dir = root();
    await new Shell(dir, ORIGIN, server({ "/index.html": "<v1>" }, ID1)).refresh();
    const longer = vi.fn(async (url: string) => {
      const p = new URL(url).pathname;
      if (p === "/shell-manifest.json")
        return json({
          id: ID2,
          files: [
            { path: "/index.html", size: 4 },
            { path: "/a.js", size: 2 },
          ],
        });
      return new Response(p === "/a.js" ? "too long" : "<v2>");
    });
    await new Shell(dir, ORIGIN, longer).refresh();
    expect(readFileSync(path.join(dir, "current"), "utf8")).toBe(ID1);
    expect(existsSync(path.join(dir, ID2))).toBe(false);
  });

  it("downloads a generation and serves its files by path", async () => {
    const dir = root();
    const shell = new Shell(dir, ORIGIN, server({ "/index.html": "<html>", "/assets/a.js": "js" }, ID1));
    await shell.refresh();
    expect(await shell.file("/index.html")).toMatchObject({ size: 6, type: "text/html; charset=utf-8" });
    expect(await shell.file("/assets/a.js")).toMatchObject({ size: 2 });
    expect(await shell.file("/missing.js")).toBeNull();
  });

  it("swaps to a new generation and deletes the old one", async () => {
    const dir = root();
    await new Shell(dir, ORIGIN, server({ "/index.html": "<v1>" }, ID1)).refresh();
    const shell = new Shell(dir, ORIGIN, server({ "/index.html": "<v2!>" }, ID2));
    await shell.refresh();
    expect(await shell.file("/index.html")).toMatchObject({ size: 5 });
    expect(existsSync(path.join(dir, ID1))).toBe(false);
  });

  it("an HTML answer keeps the current generation", async () => {
    const dir = root();
    await new Shell(dir, ORIGIN, server({ "/index.html": "<v1>" }, ID1)).refresh();
    const html = vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } }));
    await new Shell(dir, ORIGIN, html).refresh();
    expect(readdirSync(dir).sort()).toEqual([ID1, "current"]);
  });

  it("a short file keeps the current generation", async () => {
    const dir = root();
    await new Shell(dir, ORIGIN, server({ "/index.html": "<v1>" }, ID1)).refresh();
    const lying = vi.fn(async (url: string) =>
      new URL(url).pathname === "/shell-manifest.json"
        ? json({ id: ID2, files: [{ path: "/index.html", size: 999 }] })
        : new Response("<v2 body>"),
    );
    await new Shell(dir, ORIGIN, lying).refresh();
    expect(await new Shell(dir, ORIGIN, lying).file("/index.html")).toMatchObject({ size: 4 });
    expect(readFileSync(path.join(dir, "current"), "utf8")).toBe(ID1);
    expect(existsSync(path.join(dir, ID2))).toBe(false);
  });

  it("removes a stray generation even when the manifest id is the current one", async () => {
    const dir = root();
    const s = new Shell(dir, ORIGIN, server({ "/index.html": "<v1>" }, ID1));
    await s.refresh();
    mkdirSync(path.join(dir, ID2));
    await s.refresh();
    expect(readdirSync(dir).sort()).toEqual([ID1, "current"]);
  });

  it("re-downloads when the current generation lost its index.html", async () => {
    const dir = root();
    const s = new Shell(dir, ORIGIN, server({ "/index.html": "<v1>" }, ID1));
    await s.refresh();
    rmSync(path.join(dir, ID1, "index.html"));
    await s.refresh();
    expect(await s.file("/index.html")).toMatchObject({ size: 4 });
  });

  it("does not fetch twice for overlapping refreshes", async () => {
    const fetch = server({ "/index.html": "<html>" }, ID1);
    const shell = new Shell(root(), ORIGIN, fetch);
    await Promise.all([shell.refresh(), shell.refresh()]);
    expect(fetch.mock.calls.filter(([u]) => String(u).endsWith("/shell-manifest.json"))).toHaveLength(1);
  });

  it("has nothing to serve before the first generation", async () => {
    expect(await new Shell(root(), ORIGIN, server({}, ID1)).file("/index.html")).toBeNull();
  });

  it("refuses a request path that walks out of the generation", async () => {
    const dir = root();
    const shell = new Shell(dir, ORIGIN, server({ "/index.html": "<html>" }, ID1));
    await shell.refresh();
    expect(await shell.file("/../current")).toBeNull();
  });
});
