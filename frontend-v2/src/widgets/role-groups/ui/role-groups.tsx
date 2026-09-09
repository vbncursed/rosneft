import { RoleCard, type Role, type RoleCardChip, type RoleTone } from "@/entities/role";
import { EmptyState } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";

export type RoleEntry = {
  role: Role;
  tone?: RoleTone;
  tag?: string;
  tagTone?: "accent" | "dim";
  chips?: RoleCardChip[];
  /** Usernames whose initials stack in the card's footer. */
  faces?: string[];
};

export type RoleGroup = {
  key: string;
  label: string;
  /** Free text under the heading, e.g. "read-only · defined by migrations". */
  note?: string;
  roles: RoleEntry[];
};

export type RoleGroupsProps = {
  groups: RoleGroup[];
  /** Size of the whole permission set, so every meter shares a denominator. */
  totalPermissions: number;
  selectedSlug?: string | null;
  onSelect?: (slug: string) => void;
  emptyHint?: string;
};

export function RoleGroups({
  groups,
  totalPermissions,
  selectedSlug = null,
  onSelect,
  emptyHint = "No roles match this filter.",
}: RoleGroupsProps) {
  const populated = groups.filter((group) => group.roles.length > 0);

  if (populated.length === 0) {
    return <EmptyState title={emptyHint} description="Loosen the filter to see more roles." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {populated.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <SectionHeading title={group.label} count={group.note} className="pb-3 pt-0.5" />
          <div className="grid gap-2.5 md:grid-cols-2">
            {group.roles.map((entry) => (
              <RoleCard
                key={entry.role.slug}
                role={entry.role}
                totalPermissions={totalPermissions}
                tone={entry.tone}
                tag={entry.tag}
                tagTone={entry.tagTone}
                chips={entry.chips}
                faces={entry.faces}
                selected={entry.role.slug === selectedSlug}
                onSelect={onSelect ? () => onSelect(entry.role.slug) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
