import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { rolesQuery, type Role } from "@/entities/role";
import {
  createUser,
  deleteUser,
  freezeUser,
  meQuery,
  restoreUser,
  setTwoFactorRequired,
  setUserRoles,
  unfreezeUser,
  usersQuery,
  type NewUser,
  type User,
} from "@/entities/user";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { can, type Principal } from "@/shared/session";

export type ActionKind =
  | "freeze"
  | "unfreeze"
  | "delete"
  | "restore"
  | "require-2fa"
  | "unrequire-2fa";
export type PendingAction = { kind: ActionKind; user: User };

const DONE: Record<ActionKind, string> = {
  freeze: "Account frozen",
  unfreeze: "Account unfrozen",
  delete: "Account deleted",
  restore: "Account restored",
  "require-2fa": "2FA now required",
  "unrequire-2fa": "2FA no longer required",
};

const run = ({ kind, user }: PendingAction): Promise<unknown> => {
  switch (kind) {
    case "freeze":
      return freezeUser(user.id);
    case "unfreeze":
      return unfreezeUser(user.id);
    case "delete":
      return deleteUser(user.id);
    case "restore":
      return restoreUser(user.id);
    case "require-2fa":
      return setTwoFactorRequired(user.id, true);
    case "unrequire-2fa":
      return setTwoFactorRequired(user.id, false);
  }
};

export type UsersState = {
  me: Principal | null;
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  users: User[] | null;
  roles: Role[];
  canManage: boolean;
  query: string;
  setQuery: (q: string) => void;
  selected: User | null;
  select: (id: string | null) => void;
  /** The confirm dialog's question, or null when none is open. */
  pending: PendingAction | null;
  ask: (kind: ActionKind) => void;
  confirm: () => void;
  dismiss: () => void;
  busy: boolean;
  creating: boolean;
  setCreating: (open: boolean) => void;
  create: (input: NewUser) => void;
  addingRole: boolean;
  setAddingRole: (open: boolean) => void;
  setRoles: (roleSlugs: string[]) => void;
  rolesBusy: boolean;
};

/**
 * Everything the Users screen decides. Every state change goes through a
 * pending action the confirm dialog must answer; every outcome reports
 * through notify and invalidates the list so the cards redraw from the
 * gateway's answer rather than a guess.
 */
export function useUsers(): UsersState {
  const client = useQueryClient();
  const me = useQuery(meQuery).data ?? null;
  const users = useQuery(usersQuery);
  const roles = useQuery(rolesQuery);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingRole, setAddingRole] = useState(false);

  const selected = users.data?.find((u) => u.id === selectedId) ?? null;
  const refresh = () => client.invalidateQueries({ queryKey: ["users"] });
  const fail = (err: unknown) => notify.error(messageOf(err));

  const action = useMutation({
    mutationFn: run,
    onSuccess: (_, { kind }) => {
      notify.success(DONE[kind]);
      void refresh();
    },
    onError: fail,
    onSettled: () => setPending(null),
  });

  const creation = useMutation({
    mutationFn: createUser,
    onSuccess: (user) => {
      notify.success("User created");
      setCreating(false);
      setSelectedId(user.id);
      void refresh();
    },
    onError: fail,
  });

  const roleChange = useMutation({
    mutationFn: ({ id, roleSlugs }: { id: string; roleSlugs: string[] }) =>
      setUserRoles(id, roleSlugs),
    onSuccess: () => {
      notify.success("Roles updated");
      setAddingRole(false);
      void refresh();
    },
    onError: fail,
  });

  return {
    me,
    status: users.isPending ? "loading" : users.isError ? "unavailable" : "ready",
    error: users.isError ? messageOf(users.error) : null,
    users: users.data ?? null,
    roles: roles.data ?? [],
    canManage: can(me, "users:write"),
    query,
    setQuery,
    selected,
    select: setSelectedId,
    pending,
    ask: (kind) => selected && setPending({ kind, user: selected }),
    confirm: () => pending && action.mutate(pending),
    dismiss: () => setPending(null),
    busy: action.isPending,
    creating,
    setCreating,
    create: creation.mutate,
    addingRole,
    setAddingRole,
    setRoles: (roleSlugs) => selected && roleChange.mutate({ id: selected.id, roleSlugs }),
    rolesBusy: roleChange.isPending,
  };
}
