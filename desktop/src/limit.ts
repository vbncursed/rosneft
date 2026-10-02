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
