import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  artifactsQuery,
  totalSize,
  type Artifact,
  type ContentItem,
  type ContentKind,
} from "@/entities/content";
import { deleteModel, modelsQuery } from "@/entities/model";
import { deleteTerritory, territoriesQuery } from "@/entities/territory";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { toContentItem } from "./catalog";

type Ref = { kind: ContentKind; slug: string };
const keyOf = ({ kind, slug }: Ref) => `${kind}/${slug}`;

export type ContentState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  items: ContentItem[] | null;
  storageBytes: number;
  canManage: boolean;
  canDelete: (kind: ContentKind) => boolean;
  artifactsOf: (kind: ContentKind, slug: string) => Artifact[];
  updatedAtOf: (kind: ContentKind, slug: string) => string | undefined;
  query: string;
  setQuery: (q: string) => void;
  selected: ContentItem | null;
  select: (kind: ContentKind, slug: string) => void;
  deselect: () => void;
  /** The delete confirmation's subject, or null when none is open. */
  pending: ContentItem | null;
  ask: () => void;
  confirm: () => void;
  dismiss: () => void;
  busy: boolean;
};

const DONE: Record<ContentKind, string> = {
  territory: "Territory deleted",
  model: "Model deleted",
};
const LIST_KEY: Record<ContentKind, string[]> = { territory: ["territories"], model: ["models"] };

/**
 * Everything the Content screen decides. The catalog is two lists plus one
 * artifacts query per row; the screen is ready only when all have answered,
 * because a row's status is read off its artifacts and a guess would print
 * "pending" for something that is merely still loading.
 */
export function useContent(): ContentState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const territories = useQuery(territoriesQuery);
  const models = useQuery(modelsQuery);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pending, setPending] = useState<ContentItem | null>(null);

  const refs: Ref[] = [
    ...(territories.data ?? []).map((t) => ({ kind: "territory" as const, slug: t.slug })),
    ...(models.data ?? []).map((m) => ({ kind: "model" as const, slug: m.slug })),
  ];
  const artifacts = useQueries({
    queries: refs.map((r) => artifactsQuery(r.kind, r.slug)),
    combine: (results) => ({
      pending: results.some((r) => r.isPending),
      failed: results.map(unanswered).find((e) => e !== null) ?? null,
      bySlug: new Map(results.map((r, i) => [keyOf(refs[i]), r.data ?? []])),
    }),
  });

  const artifactsOf = (kind: ContentKind, slug: string) =>
    artifacts.bySlug.get(keyOf({ kind, slug })) ?? [];
  const entityOf = (kind: ContentKind, slug: string) =>
    kind === "territory"
      ? territories.data?.find((t) => t.slug === slug)
      : models.data?.find((m) => m.slug === slug);

  const listed = territories.data && models.data;
  const items = listed
    ? [
        ...territories.data.map((t) => toContentItem("territory", t, artifactsOf("territory", t.slug))),
        ...models.data.map((m) => toContentItem("model", m, artifactsOf("model", m.slug))),
      ]
    : null;
  const selected = items?.find((i) => keyOf(i) === selectedKey) ?? null;

  const removal = useMutation({
    mutationFn: (item: ContentItem) =>
      item.kind === "territory" ? deleteTerritory(item.slug) : deleteModel(item.slug),
    onSuccess: (_, item) => {
      notify.success(DONE[item.kind]);
      setSelectedKey(null);
      void client.invalidateQueries({ queryKey: LIST_KEY[item.kind] });
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: () => setPending(null),
  });

  // Only a query that has never answered can make the screen unavailable: a
  // delete invalidates the list, and a refetch that trips must not replace a
  // populated catalog with an outage page.
  const failed = unanswered(territories) ?? unanswered(models) ?? artifacts.failed;
  const loading = territories.isPending || models.isPending || artifacts.pending;

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    items,
    storageBytes: [...artifacts.bySlug.values()].reduce((sum, a) => sum + totalSize(a), 0),
    canManage: can(me, "territory:write") || can(me, "model:write"),
    canDelete: (kind) => can(me, kind === "territory" ? "territory:delete" : "model:delete"),
    artifactsOf,
    updatedAtOf: (kind, slug) => entityOf(kind, slug)?.updatedAt,
    query,
    setQuery,
    selected,
    select: (kind, slug) => setSelectedKey(keyOf({ kind, slug })),
    deselect: () => setSelectedKey(null),
    pending,
    ask: () => selected && setPending(selected),
    confirm: () => pending && removal.mutate(pending),
    dismiss: () => setPending(null),
    busy: removal.isPending,
  };
}
