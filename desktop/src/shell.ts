import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { atomicWrite } from "./atomic-write";
import { eachLimit } from "./limit";

export type ShellManifest = { id: string; files: { path: string; size: number }[] };

const ID = /^[0-9a-f]{16,64}$/;
const SAFE_PATH = /^\/(?:[A-Za-z0-9_.@+~-]+\/)*[A-Za-z0-9_.@+~-]+$/;
const safe = (p: string): boolean => SAFE_PATH.test(p) && !p.split("/").some((s) => s === ".." || s === ".");

/** null for anything that is not a manifest; unsafe entries are skipped with a warning rather than failing the lot. */
export function parseManifest(raw: unknown): ShellManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const { id, files } = raw as { id?: unknown; files?: unknown };
  if (typeof id !== "string" || !ID.test(id) || !Array.isArray(files)) return null;
  const out: ShellManifest["files"] = [];
  const seen = new Set<string>();
  for (const f of files as { path?: unknown; size?: unknown }[]) {
    if (typeof f?.path === "string" && safe(f.path) && typeof f.size === "number" && f.size >= 0 && !seen.has(f.path)) {
      seen.add(f.path);
      out.push({ path: f.path, size: f.size });
    } else console.warn("shell: skipping manifest entry", f);
  }
  return out.some((f) => f.path === "/index.html") ? { id, files: out } : null;
}

/**
 * Production sits behind Cloudflare with JavaScript Detections on, which appends
 * a <script> to every HTML response, so an HTML file arrives longer than the
 * manifest says. An intermediary only appends: HTML may be longer, never
 * shorter. Every other file must match exactly.
 */
export const sizeAcceptable = (urlPath: string, actual: number, expected: number): boolean =>
  urlPath.endsWith(".html") ? actual >= expected : actual === expected;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".ftl": "text/plain; charset=utf-8",
};

export const contentType = (urlPath: string): string =>
  TYPES[path.extname(urlPath).toLowerCase()] ?? "application/octet-stream";

/** The SPA's files, one complete generation per deployed frontend, so it boots and opens any route with no network. */
export class Shell {
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly root: string,
    private readonly origin: string,
    private readonly fetch: (url: string) => Promise<Response>,
  ) {}

  private async currentId(): Promise<string | null> {
    try {
      const id = (await readFile(path.join(this.root, "current"), "utf8")).trim();
      return ID.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  async file(urlPath: string): Promise<{ path: string; size: number; type: string } | null> {
    const id = await this.currentId();
    if (!id || !safe(urlPath)) return null;
    const file = path.join(this.root, id, ...urlPath.split("/").filter(Boolean));
    try {
      return { path: file, size: (await stat(file)).size, type: contentType(urlPath) };
    } catch {
      return null;
    }
  }

  /** Single-flight; a failure keeps the current generation and only logs. */
  refresh(): Promise<void> {
    this.refreshing ??= this.download()
      .catch((err: unknown) => console.warn("shell: refresh failed", err))
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  private async download(): Promise<void> {
    const res = await this.fetch(`${this.origin}/shell-manifest.json`);
    // nginx answers an unknown path with index.html: a frontend without the
    // manifest yet is "nothing to update", not an error.
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) return;
    const manifest = parseManifest(await res.json());
    if (!manifest) return;
    if (manifest.id === (await this.currentId()) && (await this.hasIndex(manifest.id))) return this.sweep(manifest.id);

    const staging = path.join(this.root, `${manifest.id}.tmp`);
    await rm(staging, { recursive: true, force: true });
    await eachLimit(manifest.files, 6, async (f) => {
      const r = await this.fetch(`${this.origin}${f.path}`);
      if (!r.ok || !r.body) throw new Error(`shell: ${f.path} answered ${r.status}`);
      const dest = path.join(staging, ...f.path.split("/").filter(Boolean));
      await mkdir(path.dirname(dest), { recursive: true });
      await pipeline(Readable.fromWeb(r.body as NodeWebStream<Uint8Array>), createWriteStream(dest));
      const size = (await stat(dest)).size;
      if (!sizeAcceptable(f.path, size, f.size))
        throw new Error(`shell: ${f.path} is ${size} bytes, manifest says ${f.size}`);
    });

    await rm(path.join(this.root, manifest.id), { recursive: true, force: true });
    await rename(staging, path.join(this.root, manifest.id));
    await atomicWrite(path.join(this.root, "current"), manifest.id);
    await this.sweep(manifest.id);
  }

  private hasIndex(id: string): Promise<boolean> {
    return stat(path.join(this.root, id, "index.html")).then(
      () => true,
      () => false,
    );
  }

  /** Drops every generation but `keep`. */
  private async sweep(keep: string): Promise<void> {
    for (const name of await readdir(this.root)) {
      if (name === keep || name === "current") continue;
      // Windows refuses to delete a file a page is still reading; the next refresh retries.
      await rm(path.join(this.root, name), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
