import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Write to `tmp`, rename over `dest`; the tmp file never outlives a failure. A reader sees the old file or the new one, never half of it. */
export async function atomicWrite(
  dest: string,
  data: string | Buffer,
  tmp = `${dest}.${randomUUID()}.tmp`,
): Promise<void> {
  try {
    await mkdir(path.dirname(tmp), { recursive: true });
    await writeFile(tmp, data);
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(tmp, dest);
  } finally {
    await rm(tmp, { force: true });
  }
}
