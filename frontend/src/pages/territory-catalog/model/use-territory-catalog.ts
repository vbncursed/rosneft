import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { finishedSince, jobsQuery, type TargetJob } from "@/entities/conversion";
import { deleteTerritory, territoriesQuery, toTerritoryCard, type TerritoryCardModel } from "@/entities/territory";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import type { TerritoryTab } from "./catalog";

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
 * Everything the Territory Catalog screen decides: the list — which carries
 * every territory's LODs — and the jobs poll. Two queries whatever the row
 * count.
 */
export function useTerritoryCatalog(): TerritoryCatalogState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const territories = useQuery(territoriesQuery);
  const jobs = useQuery(jobsQuery);
  const [tab, setTab] = useState<TerritoryTab>("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<TerritoryCardModel | null>(null);

  const jobOf = (slug: string) => jobs.data?.find((j) => j.kind === "territory" && j.slug === slug);

  const cards = territories.data
    ? territories.data.map((t) => toTerritoryCard(t, t.lods ?? [], jobOf(t.slug)))
    : null;

  const removal = useMutation({
    mutationFn: (slug: string) => deleteTerritory(slug),
    onSuccess: () => {
      notify.success("Territory deleted");
      void client.invalidateQueries({ queryKey: ["territories"] });
      // Its placements go with it, so its models' usageCount drops.
      void client.invalidateQueries({ queryKey: ["models"] });
      void client.invalidateQueries({ queryKey: ["model"] });
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: () => setPending(null),
  });

  // Only a query that has never answered can make the screen unavailable: a
  // delete invalidates the list, and a refetch that trips must not replace a
  // populated catalog with an outage page.
  const failed = unanswered(territories) ?? unanswered(jobs);
  const loading = territories.isPending || jobs.isPending;

  // A territory whose job just finished has new LODs (or, after a failure,
  // the same old ones), and they ride on the list: re-read it once, however
  // many finished. /api/jobs drops a succeeded job on its next poll and
  // nothing else would ever refetch the list. The row's artifacts are marked
  // stale too, for the conversion page to reopen on.
  const previousJobs = useRef<TargetJob[] | undefined>(undefined);
  useEffect(() => {
    if (!jobs.data) return;
    const finished = finishedSince(previousJobs.current, jobs.data);
    if (finished.some((j) => j.kind === "territory"))
      void client.invalidateQueries({ queryKey: ["territories"] });
    for (const { kind, slug } of finished)
      void client.invalidateQueries({ queryKey: ["artifacts", kind, slug] });
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
    canUpload: can(me, "territory:create"),
    canDelete: can(me, "territory:delete"),
    canReplace: can(me, "territory:write"),
    pending,
    ask: (slug) => setPending(cards?.find((c) => c.slug === slug) ?? null),
    confirm: () => pending && removal.mutate(pending.slug),
    dismiss: () => setPending(null),
    busy: removal.isPending,
  };
}
