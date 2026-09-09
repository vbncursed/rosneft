import { PersonCard, type User } from "@/entities/user";
import { EmptyState } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";

export type Person = {
  user: User;
  /** e.g. "3 territories", or "—". Absent when nothing can say. */
  territories?: string;
  /** e.g. "yesterday 18:02". Absent when nothing can say. */
  lastSeen?: string;
};

export type PeopleGroup = {
  key: string;
  label: string;
  people: Person[];
  /** Total in the group, which may exceed what is loaded. */
  total?: number;
};

export type PeopleGroupsProps = {
  groups: PeopleGroup[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Shown when the filter matches nobody. */
  emptyHint?: string;
};

const plural = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function PeopleGroups({
  groups,
  selectedId = null,
  onSelect,
  emptyHint = "No one matches this filter.",
}: PeopleGroupsProps) {
  const populated = groups.filter((group) => group.people.length > 0);

  if (populated.length === 0) {
    return <EmptyState title={emptyHint} description="Loosen the filter to see more accounts." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {populated.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <SectionHeading
            title={group.label}
            count={plural(group.total ?? group.people.length)}
            className="pb-3 pt-0.5"
          />
          <div className="grid gap-2.5 md:grid-cols-2">
            {group.people.map((person) => (
              <PersonCard
                key={person.user.id}
                user={person.user}
                territories={person.territories}
                lastSeen={person.lastSeen}
                selected={person.user.id === selectedId}
                onSelect={onSelect ? () => onSelect(person.user.id) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
