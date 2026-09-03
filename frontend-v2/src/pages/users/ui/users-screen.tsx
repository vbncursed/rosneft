import { useMemo } from "react";
import { roleTitle } from "@/entities/user";
import { CreateUserDialog } from "@/features/create-user";
import { AddRoleDialog, RoleChips } from "@/features/role-assign";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { coverageOf, groupPeople, inspectorDetails, matchesPerson, statsOf } from "../model/people";
import { useUsers, type PendingAction } from "../model/use-users";
import { UsersPage } from "./users-page";

const QUESTION: Record<
  PendingAction["kind"],
  (name: string) => {
    title: string;
    description: string;
    confirmLabel: string;
    tone: "default" | "danger";
  }
> = {
  freeze: (n) => ({
    title: `Freeze ${n}?`,
    description: "They are signed out everywhere and cannot sign in until unfrozen.",
    confirmLabel: "Freeze",
    tone: "danger",
  }),
  unfreeze: (n) => ({
    title: `Unfreeze ${n}?`,
    description: "They can sign in again.",
    confirmLabel: "Unfreeze",
    tone: "default",
  }),
  delete: (n) => ({
    title: `Delete ${n}?`,
    description: "The account is soft-deleted and can be restored later.",
    confirmLabel: "Delete",
    tone: "danger",
  }),
  restore: (n) => ({
    title: `Restore ${n}?`,
    description: "The account comes back with the roles it had.",
    confirmLabel: "Restore",
    tone: "default",
  }),
  "require-2fa": (n) => ({
    title: `Require 2FA for ${n}?`,
    description:
      "They keep signing in, but reach only the enrollment screens until a second factor is enrolled.",
    confirmLabel: "Require 2FA",
    tone: "default",
  }),
  "unrequire-2fa": (n) => ({
    title: `Stop requiring 2FA for ${n}?`,
    description: "An enrolled second factor stays enabled.",
    confirmLabel: "Stop requiring",
    tone: "default",
  }),
};

const LABEL = "m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted";

/** Maps the container onto the page and draws the dialogs beside it. */
export function UsersScreen() {
  const s = useUsers();

  const groups = useMemo(
    () => (s.users ? groupPeople(s.users.filter((u) => matchesPerson(u, s.query)), s.roles) : []),
    [s.users, s.roles, s.query],
  );

  if (s.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading people" className="flex flex-col gap-3">
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable" || !s.users) {
    return <Callout tone="bad">People are unavailable: {s.error}</Callout>;
  }

  const selected = s.selected;
  const held = new Set(selected?.roleSlugs ?? []);
  const question = s.pending ? QUESTION[s.pending.kind](s.pending.user.username) : null;

  return (
    <>
      <UsersPage
        groups={groups}
        coverage={coverageOf(s.users)}
        stats={statsOf(s.users, s.roles)}
        query={s.query}
        onQueryChange={s.setQuery}
        selectedId={selected?.id ?? null}
        onSelect={s.select}
        onCloseInspector={() => s.select(null)}
        inspected={
          selected && {
            user: selected,
            details: inspectorDetails(selected),
            body: (
              <div>
                <p className={LABEL}>Roles</p>
                <RoleChips
                  roles={selected.roleSlugs.map((slug) => ({
                    slug,
                    title: roleTitle(selected, slug),
                  }))}
                  onRemove={(slug) => s.setRoles(selected.roleSlugs.filter((x) => x !== slug))}
                  onAdd={() => s.setAddingRole(true)}
                  readOnly={!s.canManage}
                />
              </div>
            ),
          }
        }
        canManage={s.canManage}
        onCreateUser={() => s.setCreating(true)}
        onRequire2fa={() => s.ask(selected?.totpRequired ? "unrequire-2fa" : "require-2fa")}
        onFreeze={() => s.ask(selected?.status === "frozen" ? "unfreeze" : "freeze")}
        onDelete={() => s.ask(selected?.status === "deleted" ? "restore" : "delete")}
      />

      {question ? (
        <ConfirmDialog open {...question} busy={s.busy} onConfirm={s.confirm} onCancel={s.dismiss} />
      ) : null}
      {s.creating ? (
        <CreateUserDialog
          open
          roles={s.roles.map((r) => ({ slug: r.slug, title: r.title }))}
          onClose={() => s.setCreating(false)}
          onCreate={s.create}
        />
      ) : null}
      {s.addingRole && selected ? (
        <AddRoleDialog
          open
          options={s.roles.filter((r) => !held.has(r.slug)).map((r) => ({ slug: r.slug, title: r.title }))}
          busy={s.rolesBusy}
          onClose={() => s.setAddingRole(false)}
          onAdd={(slug) => s.setRoles([...selected.roleSlugs, slug])}
        />
      ) : null}
    </>
  );
}
