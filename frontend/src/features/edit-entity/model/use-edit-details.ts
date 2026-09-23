import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { updateModel } from "@/entities/model";
import { updateTerritory } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type EntityKind = "model" | "territory";
export type DetailsPatch = { title?: string; description?: string };
type Details = { slug: string; title: string; description?: string };

const LIST_KEY: Record<EntityKind, string> = { model: "models", territory: "territories" };

/**
 * `setQueryData` clears a query's invalidated mark. A copy another write had
 * already marked stale (a placement's count, say) gets the mark back, so the
 * merged title does not pass the rest of it off as fresh.
 */
function mergeInto<T>(client: QueryClient, queryKey: unknown[], update: (old: T | undefined) => T | undefined) {
  const wasStale = client.getQueryState(queryKey)?.isInvalidated ?? false;
  client.setQueryData<T>(queryKey, update);
  if (wasStale) void client.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
}

/**
 * Writes a saved title and description into every cached copy of the entity —
 * its own query, its row in the list and, for a territory, the viewer's scene
 * bundle (the header reads its title from there) — so nothing refetches.
 */
function writeBack(client: QueryClient, kind: EntityKind, saved: Details) {
  const merge = <T extends Details>(e: T): T =>
    e.slug === saved.slug ? { ...e, title: saved.title, description: saved.description } : e;
  mergeInto<Details>(client, [kind, saved.slug], (old) => old && merge(old));
  mergeInto<Details[]>(client, [LIST_KEY[kind]], (old) => old?.map(merge));
  if (kind === "territory") {
    mergeInto<{ territory: Details }>(client, ["scene", saved.slug], (old) => old && { ...old, territory: merge(old.territory) });
  }
}

/** PATCHes a model's or territory's title and description; a refusal is a toast. */
export function useEditDetails(kind: EntityKind, slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: DetailsPatch): Promise<Details> =>
      kind === "model" ? updateModel(slug, patch) : updateTerritory(slug, patch),
    onSuccess: (saved) => {
      writeBack(client, kind, saved);
      notify.success("Changes saved");
    },
    onError: (err) => notify.error(messageOf(err)),
  });
}
