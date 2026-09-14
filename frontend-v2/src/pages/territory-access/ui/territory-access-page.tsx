import { StatTile, type StatTileTone } from "@/entities/metric";
import type { AccessGrant, TerritoryAccess, Visibility } from "@/entities/territory";
import { FilterBar, type ExtraFilter } from "@/features/audit-filter";
import { Button } from "@/shared/ui/button";
import { CoverageMeter, type CoverageSegment } from "@/shared/ui/coverage-meter";
import { AccessGroups, type AccessGroup } from "@/widgets/access-groups";
import { AccessInspector } from "@/widgets/access-inspector";
import { PageHeader } from "@/widgets/page-header";

export type AccessPageStat = {
  label: string;
  value: string;
  hint: string;
  tone?: StatTileTone;
};

/** The territory open in the manager, with the access the route resolved. */
export type ManagedTerritory = {
  territory: TerritoryAccess;
  visibility: Visibility;
  grants: AccessGrant[];
  dirty?: boolean;
  saving?: boolean;
};

export type TerritoryAccessPageProps = {
  groups: AccessGroup[];
  mix: { label: string; detail: string; segments: CoverageSegment[] };
  stats: AccessPageStat[];

  query: string;
  onQueryChange: (query: string) => void;
  extraFilters?: ExtraFilter[];

  selectedSlug: string | null;
  onManage: (territory: TerritoryAccess) => void;
  onCloseInspector: () => void;
  /** Absent while the selected territory's access is still loading. */
  managed?: ManagedTerritory | null;

  onVisibilityChange?: (visibility: Visibility) => void;
  onAddPerson: () => void;
  onRemoveGrant: (userId: string) => void;
  onCancel: () => void;
  onSave: () => void;

  onBulkAssign?: () => void;
  canManage?: boolean;
  /** What the list says when it is empty — a filter miss by default. */
  emptyHint?: string;
};

const FILTER_PLACEHOLDER = "filter: visibility:assigned person:d.smirnov";

export function TerritoryAccessPage({
  groups,
  mix,
  stats,
  query,
  onQueryChange,
  extraFilters,
  selectedSlug,
  onManage,
  onCloseInspector,
  managed,
  onVisibilityChange,
  onAddPerson,
  onRemoveGrant,
  onCancel,
  onSave,
  onBulkAssign,
  canManage = true,
  emptyHint,
}: TerritoryAccessPageProps) {
  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Owner only · who can open what"
        title="Territory access"
        action={
          canManage && onBulkAssign ? (
            <Button variant="primary" onClick={onBulkAssign}>
              Bulk assign
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <CoverageMeter
          label={mix.label}
          detail={mix.detail}
          detailTone="accent"
          segments={mix.segments}
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
        label="Filter territories"
        placeholder={FILTER_PLACEHOLDER}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,1fr)_minmax(300px,380px)]">
        <AccessGroups
          groups={groups}
          selectedSlug={selectedSlug}
          onManage={onManage}
          {...(emptyHint ? { emptyHint } : {})}
        />

        {managed ? (
          // Sticky so the panel stays put while the list scrolls behind it.
          <div className="xl:sticky xl:top-6">
            <AccessInspector
              territory={managed.territory}
              visibility={managed.visibility}
              grants={managed.grants}
              dirty={managed.dirty}
              saving={managed.saving}
              onVisibilityChange={onVisibilityChange}
              onAddPerson={onAddPerson}
              onRemoveGrant={onRemoveGrant}
              onClose={onCloseInspector}
              onCancel={onCancel}
              onSave={onSave}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
