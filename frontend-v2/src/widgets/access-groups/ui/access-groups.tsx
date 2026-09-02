import { TerritoryAccessRow, type TerritoryAccess } from "@/entities/territory";
import { EmptyState } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";

export type AccessGroup = {
  key: string;
  label: string;
  /** Free text beside the heading, e.g. "6 territories". */
  note?: string;
  territories: TerritoryAccess[];
};

export type AccessGroupsProps = {
  groups: AccessGroup[];
  selectedSlug?: string | null;
  onManage: (territory: TerritoryAccess) => void;
  emptyHint?: string;
};

export function AccessGroups({
  groups,
  selectedSlug = null,
  onManage,
  emptyHint = "No territories match this filter.",
}: AccessGroupsProps) {
  const populated = groups.filter((group) => group.territories.length > 0);

  if (populated.length === 0) {
    return (
      <EmptyState title={emptyHint} description="Loosen the filter to see more territories." />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {populated.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <SectionHeading title={group.label} count={group.note} className="pb-3 pt-0.5" />
          <div className="flex flex-col gap-2.5">
            {group.territories.map((territory) => (
              <TerritoryAccessRow
                key={territory.slug}
                territory={territory}
                selected={territory.slug === selectedSlug}
                onManage={() => onManage(territory)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
