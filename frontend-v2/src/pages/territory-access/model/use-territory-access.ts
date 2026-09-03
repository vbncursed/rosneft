import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  adminsQuery,
  setTerritoryAdmins,
  territoriesQuery,
  type AccessGrant,
  type TerritoryAccess,
} from "@/entities/territory";
import { meQuery, usersQuery } from "@/entities/user";
import type { PersonOption } from "@/features/grant-access";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { candidatesOf, grantsOf, sameSet, toTerritoryAccess } from "./access-view";

export type AccessState = {
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  territories: TerritoryAccess[] | null;
  adminsBySlug: Record<string, string[]>;
  grantsOf: (slug: string) => AccessGrant[];
  canManage: boolean;
  query: string;
  setQuery: (q: string) => void;
  selected: TerritoryAccess | null;
  select: (slug: string | null) => void;
  /** The selected territory's grants as edited, or as saved when untouched. */
  draft: AccessGrant[];
  dirty: boolean;
  add: (userId: string) => void;
  remove: (userId: string) => void;
  cancel: () => void;
  save: () => void;
  saving: boolean;
  candidates: PersonOption[];
  adding: boolean;
  setAdding: (open: boolean) => void;
};

/**
 * Everything the Territory access screen decides. One admins query per
 * territory; drafts are kept per slug so switching territories loses
 * nothing; save is one PUT of the whole set.
 */
export function useTerritoryAccess(): AccessState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const territories = useQuery(territoriesQuery);
  const users = useQuery(usersQuery);
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [adding, setAdding] = useState(false);

  const slugs = (territories.data ?? []).map((t) => t.slug);
  const admins = useQueries({
    queries: slugs.map(adminsQuery),
    // `combine` stays inline: it closes over `slugs`, and only the array built
    // in the same render lines up with `results`. Hoisting it into a
    // useCallback would pair one render's results with another's slugs and
    // mis-key `bySlug`.
    combine: (results) => ({
      pending: results.some((r) => r.isPending),
      failed: results.map(unanswered).find((e) => e !== null) ?? null,
      bySlug: Object.fromEntries(results.map((r, i) => [slugs[i], r.data ?? []])) as Record<
        string,
        string[]
      >,
    }),
  });

  const known = users.data ?? [];
  const rows =
    territories.data && users.data
      ? territories.data.map((t) => toTerritoryAccess(t, admins.bySlug[t.slug] ?? [], known))
      : null;
  const selected = rows?.find((t) => t.slug === selectedSlug) ?? null;
  const savedIds = selectedSlug ? (admins.bySlug[selectedSlug] ?? []) : [];
  const draftIds = selectedSlug ? (drafts[selectedSlug] ?? savedIds) : [];
  const dirty = selectedSlug !== null && !sameSet(draftIds, savedIds);

  const edit = (ids: string[]) => selectedSlug && setDrafts((d) => ({ ...d, [selectedSlug]: ids }));
  const dropDraft = (slug: string) => setDrafts(({ [slug]: _dropped, ...rest }) => rest);

  const saving = useMutation({
    mutationFn: ({ slug, ids }: { slug: string; ids: string[] }) => setTerritoryAdmins(slug, ids),
    onSuccess: (_, { slug }) => {
      notify.success("Access saved");
      dropDraft(slug);
      void client.invalidateQueries({ queryKey: ["territory-admins", slug] });
    },
    onError: (err) => notify.error(messageOf(err)),
  });

  // Only a query that has never answered can make the screen unavailable: a
  // save invalidates one admins query, and a refetch that trips must not
  // replace a populated list with an outage page.
  const failed = unanswered(territories) ?? unanswered(users) ?? admins.failed;
  const loading = territories.isPending || users.isPending || admins.pending;

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    territories: rows,
    adminsBySlug: admins.bySlug,
    grantsOf: (slug) => grantsOf(admins.bySlug[slug] ?? [], known),
    canManage: me?.isOwner ?? false,
    query,
    setQuery,
    selected,
    select: setSelectedSlug,
    draft: grantsOf(draftIds, known),
    dirty,
    add: (userId) => {
      edit([...draftIds, userId]);
      setAdding(false);
    },
    remove: (userId) => edit(draftIds.filter((id) => id !== userId)),
    cancel: () => selectedSlug && dropDraft(selectedSlug),
    save: () => dirty && selectedSlug && saving.mutate({ slug: selectedSlug, ids: draftIds }),
    saving: saving.isPending,
    candidates: candidatesOf(known, draftIds),
    adding,
    setAdding,
  };
}
