import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { artifactsQuery } from "@/entities/content";
import { finishedSince, jobsQuery, type TargetJob } from "@/entities/conversion";
import { deleteTerritory, territoriesQuery } from "@/entities/territory";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { toTerritoryCard, type TerritoryCardModel, type TerritoryTab } from "./catalog";

export type TerritoryCatalogState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  /** Every territory the caller may see, unfiltered — the screen narrows it by tab and query. */
  cards: TerritoryCardModel[] | null;
  tab: TerritoryTab;
  setTab: (tab: TerritoryTab) => void;
  query: string;
  setQuery: (q: string) => void;
  canUpload: boolean;
  canDelete: boolean;
  canReplace: boolean;
  /** The delete confirmation's subject, or null when none is open. */
  pending: TerritoryCardModel | null;
  ask: (slug: string) => void;
  confirm: () => void;
  dismiss: () => void;
  busy: boolean;
};

/**
 * Everything the Territory Catalog screen decides. Mirrors useContent: two
 * queries plus one artifacts query per row, ready only once every one of them
 * has answered — a row's status is read off its artifacts and a guess would
 * print "pending" for something merely still loading.
 */
export function useTerritoryCatalog(): TerritoryCatalogState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const territories = useQuery(territoriesQuery);
  const jobs = useQuery(jobsQuery);
  const [tab, setTab] = useState<TerritoryTab>("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<TerritoryCardModel | null>(null);

  const refs = territories.data ?? [];
  const artifacts = useQueries({
    queries: refs.map((t) => artifactsQuery("territory", t.slug)),
    // Inline, not hoisted: it closes over `refs`, and only the array built in
    // the same render lines up with `results` (see use-content.ts).
    combine: (results) => ({
      pending: results.some((r) => r.isPending),
      failed: results.map(unanswered).find((e) => e !== null) ?? null,
      bySlug: new Map(results.map((r, i) => [refs[i].slug, r.data ?? []])),
    }),
  });

  const jobOf = (slug: string) => jobs.data?.find((j) => j.kind === "territory" && j.slug === slug);

  const cards = territories.data
    ? territories.data.map((t) => toTerritoryCard(t, artifacts.bySlug.get(t.slug) ?? [], jobOf(t.slug)))
    : null;

  const removal = useMutation({
    mutationFn: (slug: string) => deleteTerritory(slug),
    onSuccess: () => {
      notify.success("Territory deleted");
      void client.invalidateQueries({ queryKey: ["territories"] });
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: () => setPending(null),
  });

  // Only a query that has never answered can make the screen unavailable: a
  // delete invalidates the list, and a refetch that trips must not replace a
  // populated catalog with an outage page.
  const failed = unanswered(territories) ?? artifacts.failed ?? unanswered(jobs);
  const loading = territories.isPending || artifacts.pending || jobs.isPending;

  // A row whose job just finished has new artifacts (or, after a failure, the
  // same old ones): re-read that row's artifacts so LODs, size and status
  // catch up. Ported from use-content.ts — /api/jobs drops a succeeded job on
  // its next poll and nothing else would ever refetch this row's artifacts.
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
    canUpload: can(me, "territory:write"),
    canDelete: can(me, "territory:delete"),
    canReplace: can(me, "territory:write"),
    pending,
    ask: (slug) => setPending(cards?.find((c) => c.slug === slug) ?? null),
    confirm: () => pending && removal.mutate(pending.slug),
    dismiss: () => setPending(null),
    busy: removal.isPending,
  };
}
