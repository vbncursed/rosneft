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
  setUserPassword,
  setUserRoles,
  unfreezeUser,
  usersQuery,
  type NewUser,
  type User,
} from "@/entities/user";
import { HttpError, messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { assignableRoles, canResetPassword } from "./people";

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

// Every taken email or username is one line. The gateway already answers one
// message; fixing the copy here keeps the field unnamed whatever it sends.
const LOGIN_TAKEN = "That email or username is unavailable.";

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
  status: "loading" | "ready" | "unavailable";
  error: string | null;
  users: User[] | null;
  roles: Role[];
  /** The roles a picker may offer this reader: `admin` only to Root. */
  assignableRoles: Role[];
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
  createBusy: boolean;
  addingRole: boolean;
  setAddingRole: (open: boolean) => void;
  setRoles: (roleSlugs: string[]) => void;
  rolesBusy: boolean;
  /** Whether this reader may set the open person's password. */
  canResetPassword: boolean;
  resetting: boolean;
  setResetting: (open: boolean) => void;
  resetPassword: (password: string) => void;
  resetBusy: boolean;
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
  const [resetting, setResetting] = useState(false);

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
    onError: (err) =>
      err instanceof HttpError && err.status === 409 ? notify.error(LOGIN_TAKEN) : fail(err),
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

  // No refresh: nothing on the list changes when a password does.
  const reset = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      setUserPassword(id, password),
    onSuccess: () => {
      notify.success("Password changed. The user was signed out everywhere.");
      setResetting(false);
    },
    onError: fail,
  });

  // Both queries, not just the list. With roles still pending — or refused,
  // which `users:read` alone gets — every person would file under "No role"
  // and "Roles in use" would read 0: a confident wrong answer wearing a
  // loaded screen's clothes.
  // Only a query that has never answered can make the screen unavailable: every
  // mutation calls refresh(), and a refetch that trips must not replace a
  // working screen with an outage page.
  const failed = unanswered(users) ?? unanswered(roles);

  return {
    // Loading wins while anything is outstanding: a refusal on one query and a
    // wait on the other is still one answer away, and flashing an outage page
    // before the list lands says the screen is broken when it is only slow.
    status:
      users.isPending || roles.isPending ? "loading" : failed ? "unavailable" : "ready",
    error: failed ? messageOf(failed) : null,
    users: users.data ?? null,
    roles: roles.data ?? [],
    assignableRoles: assignableRoles(me, roles.data ?? []),
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
    createBusy: creation.isPending,
    addingRole,
    setAddingRole,
    setRoles: (roleSlugs) => selected && roleChange.mutate({ id: selected.id, roleSlugs }),
    rolesBusy: roleChange.isPending,
    canResetPassword: canResetPassword(me, selected),
    resetting,
    setResetting,
    resetPassword: (password) => selected && reset.mutate({ id: selected.id, password }),
    resetBusy: reset.isPending,
  };
}
