import { Transform } from "node:stream";

/**
 * Runs fn over items with at most n (at least 1) in flight. After the first failure no
 * worker starts another item, and the first error is thrown once every in-flight fn has settled.
 */
export async function eachLimit<T>(items: readonly T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- each worker takes the next item only after its previous one settled; that is the concurrency cap
        await fn(items[next++] as T);
      } catch (err) {
        if (!failed) firstError = err;
        failed = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, n), items.length) }, worker));
  if (failed) throw firstError;
}

/** Throws before the body is read when the server already declares more than `max`. A missing or smaller (encoded) length proves nothing: `byteCap` counts. */
export function assertDeclaredWithin(headers: Headers, max: number, what: string): void {
  const declared = Number(headers.get("content-length"));
  if (declared > max) throw new Error(`${what}: declares ${declared} bytes, cap is ${max}`);
}

/** Passes bytes through and fails the pipeline the moment more than `max` have gone by, so a runaway body stops short of the disk. */
export function byteCap(max: number, what: string): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      seen += chunk.length;
      done(seen > max ? new Error(`${what}: exceeds ${max} bytes`) : null, chunk);
    },
  });
}
