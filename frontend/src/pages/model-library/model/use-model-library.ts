import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { jobsQuery, useStaleOnFinish } from "@/entities/conversion";
import { deleteModel, modelsQuery, toModelCard, type ModelCardModel } from "@/entities/model";
import { meQuery } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { type ModelTab } from "./catalog";

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
 * Everything the Model Library screen decides: the list — which carries every
 * model's LODs — and the jobs poll. Two queries whatever the row count.
 */
export function useModelLibrary(): ModelLibraryState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const models = useQuery(modelsQuery);
  const jobs = useQuery(jobsQuery);
  const [tab, setTab] = useState<ModelTab>("all");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<ModelCardModel | null>(null);

  const jobOf = (slug: string) => jobs.data?.find((j) => j.kind === "model" && j.slug === slug);

  const cards = models.data
    ? models.data.map((m) => toModelCard(m, m.lods ?? [], jobOf(m.slug)))
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
  const failed = unanswered(models) ?? unanswered(jobs);
  const loading = models.isPending || jobs.isPending;

  // A finished job's new LODs ride on the lists, a model's on its artifacts.
  useStaleOnFinish(jobs.data);

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
