import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export const MANIFEST = "shell-manifest.json";

/**
 * Lists every file in `dir` for the desktop shell's offline copy: its path from
 * the web root, its size, and one id that changes whenever any file does. The
 * shell downloads the whole list as a generation — lazy route chunks and the
 * draco/basis/pdfjs decoders included — because a cache filled only by what was
 * requested breaks every route and territory nobody happened to open online.
 */
export function writeShellManifest(dir: string): void {
  const files: { path: string; size: number }[] = [];
  const id = createHash("sha256");
  const walk = (rel: string): void => {
    for (const name of readdirSync(path.join(dir, rel)).sort()) {
      const relPath = rel ? `${rel}/${name}` : name;
      const full = path.join(dir, relPath);
      // Finder litter copied from public/ must not ship; other dotfiles stay on disk but out of the manifest.
      if (name === ".DS_Store") rmSync(full);
      if (name.startsWith(".")) continue;
      if (statSync(full).isDirectory()) {
        walk(relPath);
        continue;
      }
      if (relPath === MANIFEST) continue;
      const bytes = readFileSync(full);
      id.update(relPath).update(createHash("sha256").update(bytes).digest());
      files.push({ path: `/${relPath}`, size: bytes.length });
    }
  };
  walk("");
  writeFileSync(path.join(dir, MANIFEST), JSON.stringify({ id: id.digest("hex").slice(0, 32), files }));
}

export function shellManifest(): Plugin {
  let outDir = "dist";
  return {
    name: "andrey:shell-manifest",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    // closeBundle, not writeBundle: public/ (pdfjs, draco, basis) is copied by then.
    closeBundle() {
      writeShellManifest(outDir);
    },
  };
}
