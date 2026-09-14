import { useMemo } from "react";
import { CreateRoleDialog } from "@/features/create-role";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  distributionOf,
  groupRoles,
  matchesRole,
  startableFrom,
  statsOf,
  unsaveable,
  withUserCounts,
} from "../model/roles-view";
import { useRoles } from "../model/use-roles";
import { RolesPage } from "./roles-page";

// The matrix cannot offer a grant this actor lacks, but the gateway checks the
// whole resulting set and PUT …/permissions replaces it — so a role that
// already holds one is unsaveable however it is edited.
const SAVE_BLOCKED = "This role holds permissions you can't grant, so it can't be saved from here.";

/** Maps the container onto the page and draws the create dialog beside it. */
export function RolesScreen() {
  const s = useRoles();
  const counted = useMemo(() => withUserCounts(s.roles, s.users), [s.roles, s.users]);
  const groups = useMemo(
    () =>
      groupRoles(
        counted.filter((r) => matchesRole(r, s.query)),
        s.users,
        s.permissions,
        s.grantable,
        { slug: s.selected?.slug ?? null, dirty: s.dirty },
      ),
    [counted, s.users, s.permissions, s.grantable, s.query, s.selected, s.dirty],
  );

  if (s.status === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading roles"
        className="flex flex-col gap-3"
      >
        <Skeleton height="28px" width="30%" />
        <Skeleton height="96px" />
        <Skeleton height="96px" />
      </div>
    );
  }
  if (s.status === "unavailable") {
    return <Callout tone="bad">Roles are unavailable: {s.error}</Callout>;
  }

  const selected = s.selected && counted.find((r) => r.slug === s.selected?.slug);
  // A reader has no Save to block, and its own notice already says why.
  const blocked =
    s.canManage && selected && unsaveable(selected, s.grantable).length > 0 ? SAVE_BLOCKED : undefined;

  return (
    <>
      <RolesPage
        groups={groups}
        allPermissions={s.permissions}
        distribution={distributionOf(counted, s.users)}
        stats={statsOf(counted, s.permissions, s.users)}
        query={s.query}
        onQueryChange={s.setQuery}
        selectedSlug={s.selected?.slug ?? null}
        onSelect={s.select}
        onCloseInspector={() => s.select(null)}
        edited={
          selected && s.draft
            ? {
                role: { ...selected, title: s.draft.title },
                granted: s.draft.granted,
                dirty: s.dirty,
                saving: s.saving,
              }
            : null
        }
        grantable={s.grantable}
        onTogglePermission={s.toggle}
        onRenameRole={s.rename}
        onResetRole={s.reset}
        onSaveRole={s.save}
        onCreateRole={() => s.setCreating(true)}
        onDeleteRole={s.canManage ? s.askDelete : undefined}
        canManage={s.canManage}
        saveBlocked={blocked}
      />
      {s.creating ? (
        <CreateRoleDialog
          open
          startFrom={startableFrom(s.roles, s.grantable).map((r) => ({
            slug: r.slug,
            title: r.title,
            permissionSlugs: r.permissionSlugs,
          }))}
          busy={s.creatingBusy}
          onClose={() => s.setCreating(false)}
          onCreate={s.create}
        />
      ) : null}
      {s.deleting ? (
        <ConfirmDialog
          open
          title={`Delete role "${s.deleting.title}"?`}
          description="Its permissions are gone with it. This cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          busy={s.deletingBusy}
          onConfirm={s.confirmDelete}
          onCancel={s.dismissDelete}
        />
      ) : null}
    </>
  );
}
