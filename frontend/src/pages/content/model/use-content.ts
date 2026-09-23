import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { totalSize, type ContentItem, type ContentKind, type LodSummary } from "@/entities/content";
import { jobsQuery, LIST_KEY, useStaleOnFinish, type TargetJob } from "@/entities/conversion";
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
  /** `territory:create` — Root alone; `territory:write` edits but creates nothing. */
  canCreateTerritory: boolean;
  canDelete: (kind: ContentKind) => boolean;
  artifactsOf: (kind: ContentKind, slug: string) => LodSummary[];
  /** The target's live or failed conversion, or undefined when it has none. */
  jobOf: (kind: ContentKind, slug: string) => TargetJob | undefined;
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

/**
 * Everything the Content screen decides. Two lists — each row carries its own
 * LODs — and the jobs poll; ready once all three have answered.
 */
export function useContent(): ContentState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const territories = useQuery(territoriesQuery);
  const models = useQuery(modelsQuery);
  const jobs = useQuery(jobsQuery);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pending, setPending] = useState<ContentItem | null>(null);

  const jobOf = (kind: ContentKind, slug: string) =>
    jobs.data?.find((j) => j.kind === kind && j.slug === slug);
  const entityOf = (kind: ContentKind, slug: string) =>
    kind === "territory"
      ? territories.data?.find((t) => t.slug === slug)
      : models.data?.find((m) => m.slug === slug);
  const artifactsOf = (kind: ContentKind, slug: string) => entityOf(kind, slug)?.lods ?? [];

  const listed = territories.data && models.data;
  const items = listed
    ? [
        ...territories.data.map((t) =>
          toContentItem("territory", t, t.lods ?? [], jobOf("territory", t.slug)),
        ),
        ...models.data.map((m) => toContentItem("model", m, m.lods ?? [], jobOf("model", m.slug))),
      ]
    : null;
  const selected = items?.find((i) => keyOf(i) === selectedKey) ?? null;

  const removal = useMutation({
    mutationFn: (item: ContentItem) =>
      item.kind === "territory" ? deleteTerritory(item.slug) : deleteModel(item.slug),
    onSuccess: (_, item) => {
      notify.success(DONE[item.kind]);
      setSelectedKey(null);
      void client.invalidateQueries({ queryKey: [LIST_KEY[item.kind]] });
      // A territory's placements go with it, so its models' usageCount drops.
      if (item.kind === "territory") {
        void client.invalidateQueries({ queryKey: ["models"] });
        void client.invalidateQueries({ queryKey: ["model"] });
      }
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: () => setPending(null),
  });

  // Only a query that has never answered can make the screen unavailable: a
  // delete invalidates the list, and a refetch that trips must not replace a
  // populated catalog with an outage page.
  const failed = unanswered(territories) ?? unanswered(models) ?? unanswered(jobs);
  const loading = territories.isPending || models.isPending || jobs.isPending;

  // A finished job's new LODs ride on the lists, a model's on its artifacts.
  useStaleOnFinish(jobs.data);

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    items,
    storageBytes: [...(territories.data ?? []), ...(models.data ?? [])].reduce(
      (sum, e) => sum + totalSize(e.lods ?? []),
      0,
    ),
    canManage: can(me, "territory:write") || can(me, "model:write"),
    canCreateTerritory: can(me, "territory:create"),
    canDelete: (kind) => can(me, kind === "territory" ? "territory:delete" : "model:delete"),
    artifactsOf,
    jobOf,
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
