import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

/** Directories cannot be opened or fsynced everywhere (Windows); the file sync is what matters there. */
const NO_DIR_SYNC = new Set(["EISDIR", "EPERM", "EINVAL", "EACCES", "ENOTSUP"]);

async function syncDir(dir: string): Promise<void> {
  try {
    const fh = await open(dir, "r");
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
  } catch (err) {
    if (!NO_DIR_SYNC.has((err as NodeJS.ErrnoException).code ?? "")) throw err;
  }
}

/**
 * Write to `tmp`, fsync it, rename over `dest`, fsync the directory; the tmp file never outlives a failure.
 * A reader sees the old file or the new one, never half of it, and a power loss cannot leave an empty `dest`.
 */
export async function atomicWrite(
  dest: string,
  data: string | Buffer,
  tmp = `${dest}.${randomUUID()}.tmp`,
): Promise<void> {
  try {
    await mkdir(path.dirname(tmp), { recursive: true });
    const fh = await open(tmp, "w");
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(tmp, dest);
    await syncDir(path.dirname(dest));
  } finally {
    await rm(tmp, { force: true });
  }
}
