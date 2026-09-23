import type { QueryClient } from "@tanstack/react-query";

/**
 * Slugs whose cached bundle a late write marked while another visit was
 * reading it. That visit changed nothing itself, so its own `changed` ref
 * says keep; the debt says drop, or the next visit seeds from the pre-write
 * bundle. Per client, so two caches never share a debt.
 */
const owed = new WeakMap<QueryClient, Set<string>>();

/**
 * A write that landed after its page had gone: drop the bundle, or — when a
 * new visit is already reading it (it stays, marked stale) — owe the drop to
 * that visit's way out.
 */
export function dropOrOweScene(client: QueryClient, slug: string): void {
  const queryKey = ["scene", slug];
  if (!client.getQueryCache().find({ queryKey, exact: true })?.getObserversCount()) {
    client.removeQueries({ queryKey, exact: true });
    return;
  }
  const slugs = owed.get(client) ?? new Set<string>();
  slugs.add(slug);
  owed.set(client, slugs);
}

/** Whether a drop was owed for this slug; consumes it. */
export const takeSceneDrop = (client: QueryClient, slug: string): boolean => owed.get(client)?.delete(slug) ?? false;
