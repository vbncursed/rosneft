import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { artifactsQuery } from "@/entities/content";
import { finishedSince, jobsQuery, type TargetJob } from "@/entities/conversion";
import { deleteModel, modelsQuery } from "@/entities/model";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { toModelCard, type ModelCardModel, type ModelTab } from "./catalog";

export type ModelLibraryState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  /** Every model the caller may see, unfiltered — the screen narrows it by tab and query. */
  cards: ModelCardModel[] | null;
  tab: ModelTab;
  setTab: (tab: ModelTab) => void;
  query: string;
  setQuery: (q: string) => void;
  canUpload: boolean;
  canDelete: boolean;
  /** The delete confirmation's subject, or null when none is open. */
  pending: ModelCardModel | null;
  ask: (slug: string) => void;
  confirm: () => void;
  dismiss: () => void;
  busy: boolean;
};

/**
 * Everything the Model Library screen decides. Mirrors useTerritoryCatalog:
 * two queries plus one artifacts query per row, ready only once every one of
 * them has answered — a row's status is read off its artifacts and a guess
 * would print "pending" for something merely still loading.
 */
export function useModelLibrary(): ModelLibraryState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const models = useQuery(modelsQuery);
  const jobs = useQuery(jobsQuery);
  const [tab, setTab] = useState<ModelTab>("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<ModelCardModel | null>(null);

  const refs = models.data ?? [];
  const artifacts = useQueries({
    queries: refs.map((m) => artifactsQuery("model", m.slug)),
    // Inline, not hoisted: it closes over `refs`, and only the array built in
    // the same render lines up with `results` (see use-content.ts).
    combine: (results) => ({
      pending: results.some((r) => r.isPending),
      failed: results.map(unanswered).find((e) => e !== null) ?? null,
      bySlug: new Map(results.map((r, i) => [refs[i].slug, r.data ?? []])),
    }),
  });

  const jobOf = (slug: string) => jobs.data?.find((j) => j.kind === "model" && j.slug === slug);

  const cards = models.data
    ? models.data.map((m) => toModelCard(m, artifacts.bySlug.get(m.slug) ?? [], jobOf(m.slug)))
    : null;

  const removal = useMutation({
    mutationFn: (slug: string) => deleteModel(slug),
    onSuccess: () => {
      notify.success("Model deleted");
      void client.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: () => setPending(null),
  });

  // Only a query that has never answered can make the screen unavailable: a
  // delete invalidates the list, and a refetch that trips must not replace a
  // populated library with an outage page.
  const failed = unanswered(models) ?? artifacts.failed ?? unanswered(jobs);
  const loading = models.isPending || artifacts.pending || jobs.isPending;

  // A row whose job just finished has new artifacts (or, after a failure, the
  // same old ones): re-read that row's artifacts so its status catches up
  // rather than dropping back to "pending" on stale, empty cached data.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    for (const { kind, slug } of finishedSince(previousJobs.current, jobs.data)) {
      void client.invalidateQueries({ queryKey: ["artifacts", kind, slug] });
    }
    previousJobs.current = jobs.data;
  }, [jobs.data, client]);

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    cards,
    tab,
    setTab,
    query,
    setQuery,
    canUpload: can(me, "model:write"),
    canDelete: can(me, "model:delete"),
    pending,
    ask: (slug) => setPending(cards?.find((c) => c.slug === slug) ?? null),
    confirm: () => pending && removal.mutate(pending.slug),
    dismiss: () => setPending(null),
    busy: removal.isPending,
  };
}
