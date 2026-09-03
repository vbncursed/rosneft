import type { Permission } from "@/entities/permission";
import { StatTile, type StatTileTone } from "@/entities/metric";
import type { Role } from "@/entities/role";
import { FilterBar, type ExtraFilter } from "@/features/audit-filter";
import { Button } from "@/shared/ui/button";
import { CoverageMeter, type CoverageSegment } from "@/shared/ui/coverage-meter";
import { Icon } from "@/shared/ui/icon";
import { PageHeader } from "@/widgets/page-header";
import { RoleGroups, type RoleGroup } from "@/widgets/role-groups";
import { RoleInspector } from "@/widgets/role-inspector";

export type RolesPageStat = {
  label: string;
  value: string;
  hint: string;
  tone?: StatTileTone;
};

/** The role open in the inspector, with its editable permission state. */
export type EditedRole = {
  role: Role;
  granted: string[];
  dirty?: boolean;
  saving?: boolean;
};

export type RolesPageProps = {
  groups: RoleGroup[];
  /** Every permission that exists; also the meters' denominator. */
  allPermissions: Permission[];
  distribution: { label: string; detail: string; segments: CoverageSegment[] };
  stats: RolesPageStat[];

  query: string;
  onQueryChange: (query: string) => void;
  extraFilters?: ExtraFilter[];

  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onCloseInspector: () => void;
  /** Absent while the selected role's permissions are still loading. */
  edited?: EditedRole | null;

  /** Slugs the signed-in actor may grant; the rest are locked. */
  grantable?: Set<string>;
  onTogglePermission: (slug: string) => void;
  onRenameRole: (title: string) => void;
  onResetRole: () => void;
  onSaveRole: () => void;

  onCreateRole: () => void;
  canManage?: boolean;
};

const FILTER_PLACEHOLDER = "filter: kind:custom grants:users.write";

export function RolesPage({
  groups,
  allPermissions,
  distribution,
  stats,
  query,
  onQueryChange,
  extraFilters,
  selectedSlug,
  onSelect,
  onCloseInspector,
  edited,
  grantable,
  onTogglePermission,
  onRenameRole,
  onResetRole,
  onSaveRole,
  onCreateRole,
  canManage = true,
}: RolesPageProps) {
  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Access control · permission sets"
        title="Roles & Permissions"
        action={
          canManage ? (
            <Button variant="primary" onClick={onCreateRole}>
              + New role
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <CoverageMeter
          label={distribution.label}
          detail={distribution.detail}
          detailTone="accent"
          segments={distribution.segments}
          className="rounded-[11px] border border-line bg-panel px-4.5 py-4"
        />
        {stats.map((stat) => (
          <StatTile
            key={stat.label}
            size="lg"
            label={stat.label}
            state={{ kind: "value", value: stat.value }}
            hint={stat.hint}
            tone={stat.tone ?? "fg"}
          />
        ))}
      </div>

      <FilterBar
        query={query}
        onChange={onQueryChange}
        extra={extraFilters}
        label="Filter roles"
        placeholder={FILTER_PLACEHOLDER}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]">
        <div className="flex flex-col gap-4">
          <RoleGroups
            groups={groups}
            totalPermissions={allPermissions.length}
            selectedSlug={selectedSlug}
            onSelect={onSelect}
          />

          {canManage ? (
            <button
              type="button"
              onClick={onCreateRole}
              className="flex cursor-pointer items-center gap-2.5 rounded-card border border-dashed border-line-2 bg-transparent px-4.5 py-4 text-left text-[13px] text-muted transition-colors duration-150 hover:border-accent-line hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="plus" size={15} />
              Create a role — start from Guest or duplicate an existing set
            </button>
          ) : null}
        </div>

        {edited ? (
          // Sticky so the permission set stays put while the list scrolls.
          <div className="xl:sticky xl:top-6">
            <RoleInspector
              role={edited.role}
              all={allPermissions}
              granted={edited.granted}
              grantable={grantable}
              dirty={edited.dirty}
              saving={edited.saving}
              // roles:read alone reaches this screen; the whole panel is a
              // reader's view then, not just the create controls.
              readOnly={!canManage}
              onToggle={onTogglePermission}
              onRename={onRenameRole}
              onReset={onResetRole}
              onSave={onSaveRole}
              onClose={onCloseInspector}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
