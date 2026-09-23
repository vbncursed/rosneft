import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { LIST_KEY } from "@/entities/conversion";
import { updateModel } from "@/entities/model";
import { updateTerritory } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type EntityKind = "model" | "territory";
export type DetailsPatch = { title?: string; description?: string };
type Details = { slug: string; title: string; description?: string };

/**
 * An in-flight refetch is cancelled first: it left before the save and would
 * land the old title back on top of it. `setQueryData` clears a query's
 * invalidated mark, so a copy another write had already marked stale (a
 * placement's count, say) gets the mark back — read before the cancel, which
 * may drop the refetch that invalidation started.
 */
async function mergeInto<T>(client: QueryClient, queryKey: unknown[], update: (old: T | undefined) => T | undefined) {
  const wasStale = client.getQueryState(queryKey)?.isInvalidated ?? false;
  await client.cancelQueries({ queryKey, exact: true });
  client.setQueryData<T>(queryKey, update);
  if (wasStale) void client.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
}

type SceneCopy = { territory: Details; modelOptions?: { slug: string; title: string }[] };

/**
 * Writes a saved title and description into every cached copy of the entity —
 * its own query, its row in the list and the viewer's scene bundles: a
 * territory's own (the header reads its title from there), and for a model
 * every bundle whose picker offers it (an option carries the title alone) —
 * so nothing refetches.
 */
async function writeBack(client: QueryClient, kind: EntityKind, saved: Details) {
  const merge = <T extends Details>(e: T): T =>
    e.slug === saved.slug ? { ...e, title: saved.title, description: saved.description } : e;
  await mergeInto<Details>(client, [kind, saved.slug], (old) => old && merge(old));
  await mergeInto<Details[]>(client, [LIST_KEY[kind]], (old) => old?.map(merge));
  if (kind === "territory") {
    await mergeInto<SceneCopy>(client, ["scene", saved.slug], (old) => old && { ...old, territory: merge(old.territory) });
    return;
  }
  const rename = <T extends { slug: string; title: string }>(o: T): T =>
    o.slug === saved.slug ? { ...o, title: saved.title } : o;
  for (const [queryKey] of client.getQueriesData<SceneCopy>({ queryKey: ["scene"] })) {
    // undefined leaves a bundle that does not offer the model untouched.
    await mergeInto<SceneCopy>(client, [...queryKey], (old) =>
      old?.modelOptions?.some((o) => o.slug === saved.slug) ? { ...old, modelOptions: old.modelOptions.map(rename) } : undefined,
    );
  }
}

/** PATCHes a model's or territory's title and description; a refusal is a toast (the dialog also shows it inline). */
export function useEditDetails(kind: EntityKind, slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: DetailsPatch): Promise<Details> =>
      kind === "model" ? updateModel(slug, patch) : updateTerritory(slug, patch),
    onSuccess: async (saved) => {
      await writeBack(client, kind, saved);
      notify.success("Changes saved");
    },
    onError: (err) => notify.error(messageOf(err)),
  });
}
