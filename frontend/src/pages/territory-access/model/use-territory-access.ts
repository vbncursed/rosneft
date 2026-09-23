import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  setTerritoryAdmins,
  territoriesQuery,
  territoryAdminsQuery,
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
 * Everything the Territory access screen decides. One admin map for every
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

  const admins = useQuery(territoryAdminsQuery);
  const adminsBySlug = admins.data ?? {};

  const known = users.data ?? [];
  const rows =
    territories.data && users.data
      ? territories.data.map((t) => toTerritoryAccess(t, adminsBySlug[t.slug] ?? [], known))
      : null;
  const selected = rows?.find((t) => t.slug === selectedSlug) ?? null;
  const savedIds = selectedSlug ? (adminsBySlug[selectedSlug] ?? []) : [];
  const draftIds = selectedSlug ? (drafts[selectedSlug] ?? savedIds) : [];
  const dirty = selectedSlug !== null && !sameSet(draftIds, savedIds);

  const edit = (ids: string[]) => selectedSlug && setDrafts((d) => ({ ...d, [selectedSlug]: ids }));
  const dropDraft = (slug: string) => setDrafts(({ [slug]: _dropped, ...rest }) => rest);

  const saving = useMutation({
    mutationFn: ({ slug, ids }: { slug: string; ids: string[] }) => setTerritoryAdmins(slug, ids),
    // The PUT is a full replace answering 204, so the ids just sent are the
    // saved set: written into the map in the same tick the draft is dropped,
    // there is no window where the panel falls back to the pre-save set, and
    // nothing re-reads the whole map for one territory's change.
    onSuccess: (_, { slug, ids }) => {
      notify.success("Access saved");
      client.setQueryData(territoryAdminsQuery.queryKey, (map) => map && { ...map, [slug]: ids });
      dropDraft(slug);
    },
    onError: (err) => notify.error(messageOf(err)),
  });

  // Only a query that has never answered can make the screen unavailable: a
  // background refetch that trips must not replace a populated list with an
  // outage page.
  const failed = unanswered(territories) ?? unanswered(users) ?? unanswered(admins);
  const loading = territories.isPending || users.isPending || admins.isPending;

  return {
    status: loading ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    territories: rows,
    adminsBySlug: adminsBySlug,
    grantsOf: (slug) => grantsOf(adminsBySlug[slug] ?? [], known),
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
