import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { permissionsQuery, type Permission } from "@/entities/permission";
import {
  createRole,
  renameRole,
  rolesQuery,
  setRolePermissions,
  type Role,
} from "@/entities/role";
import { meQuery, usersQuery, type User } from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { can, grantableSlugs, type Principal } from "@/shared/session";

type Draft = { title: string; granted: string[] };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export type RolesState = {
  me: Principal | null;
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  roles: Role[];
  permissions: Permission[];
  /** null when this actor may not read people — counts and faces stay unknown. */
  users: User[] | null;
  grantable: Set<string>;
  canManage: boolean;
  query: string;
  setQuery: (q: string) => void;
  selected: Role | null;
  draft: Draft | null;
  dirty: boolean;
  select: (slug: string | null) => void;
  toggle: (slug: string) => void;
  rename: (title: string) => void;
  reset: () => void;
  save: () => void;
  saving: boolean;
  creating: boolean;
  setCreating: (open: boolean) => void;
  create: (input: { title: string; permissionSlugs: string[] }) => void;
  creatingBusy: boolean;
};

/**
 * The draft is the inspector's truth until saved; dirty is computed against
 * the role as the gateway last returned it, so a successful save clears it by
 * the refetch alone and a failed one leaves the edits in place.
 */
export function useRoles(): RolesState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const roles = useQuery(rolesQuery);
  const permissions = useQuery(permissionsQuery);
  // Not asked for when it would only 403: the count is then honestly unknown.
  const users = useQuery({ ...usersQuery, enabled: can(me, "users:read") });
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = roles.data?.find((r) => r.slug === selectedSlug) ?? null;
  const dirty =
    !!selected &&
    !!draft &&
    (draft.title !== selected.title || !sameSet(draft.granted, selected.permissionSlugs));
  const refresh = () => client.invalidateQueries({ queryKey: ["roles"] });
  const fail = (err: unknown) => notify.error(messageOf(err));

  const select = (slug: string | null) => {
    setSelectedSlug(slug);
    const role = roles.data?.find((r) => r.slug === slug);
    setDraft(role ? { title: role.title, granted: role.permissionSlugs } : null);
  };

  const saving = useMutation({
    // Two calls when both changed; the gateway has no single "update role".
    mutationFn: async () => {
      if (!selected || !draft) return;
      if (!sameSet(draft.granted, selected.permissionSlugs))
        await setRolePermissions(selected.slug, draft.granted);
      if (draft.title !== selected.title) await renameRole(selected.slug, draft.title);
    },
    onSuccess: () => {
      notify.success("Role saved");
      void refresh();
    },
    onError: fail,
  });

  const creation = useMutation({
    mutationFn: ({ title, permissionSlugs }: { title: string; permissionSlugs: string[] }) =>
      createRole(title, permissionSlugs),
    onSuccess: (role) => {
      notify.success("Role created");
      setCreating(false);
      setSelectedSlug(role.slug);
      setDraft({ title: role.title, granted: role.permissionSlugs });
      void refresh();
    },
    onError: fail,
  });

  // The people list counts too when it was asked for: without it every role
  // reads "— users" and the distribution says "unavailable", which is an
  // answer, not a wait. A disabled query never fetches, so `isLoading` — not
  // `isPending`, which stays true forever while it is off — is what asks.
  const pending = roles.isPending || permissions.isPending || users.isLoading;
  const failure = roles.error ?? permissions.error ?? users.error;

  return {
    me,
    status: pending ? "loading" : failure ? "unavailable" : "ready",
    error: failure ? messageOf(failure) : null,
    roles: roles.data ?? [],
    permissions: permissions.data ?? [],
    users: users.data ?? null,
    grantable: grantableSlugs(me, permissions.data ?? []),
    canManage: can(me, "roles:manage"),
    query,
    setQuery,
    selected,
    draft,
    dirty,
    select,
    toggle: (slug) =>
      setDraft(
        (d) =>
          d && {
            ...d,
            granted: d.granted.includes(slug)
              ? d.granted.filter((s) => s !== slug)
              : [...d.granted, slug],
          },
      ),
    rename: (title) => setDraft((d) => d && { ...d, title }),
    reset: () => selected && setDraft({ title: selected.title, granted: selected.permissionSlugs }),
    // Nothing changed, nothing to send — and nothing to report as saved.
    save: () => dirty && saving.mutate(),
    saving: saving.isPending,
    creating,
    setCreating,
    create: creation.mutate,
    creatingBusy: creation.isPending,
  };
}
