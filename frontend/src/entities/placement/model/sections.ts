import { instanceName, matchesObjects, type ModelGroup, type PlacementInstance } from "./groups";
import type { PlacementGroup } from "./placement";

/** What an eye shows for everything it covers. */
export type EyeState = "visible" | "hidden" | "mixed";

/** A user group and its placements, each with the model it is an instance of. */
export type UserGroupSection = {
  group: PlacementGroup;
  members: { model: ModelGroup; instance: PlacementInstance }[];
};

/**
 * One model's row. `group` holds every placement of the model — its eye covers
 * them all (G-3) — and `shown` only the ungrouped ones listed under it.
 */
export type ModelSection = { group: ModelGroup; shown: PlacementInstance[] };

export type PlacementSections = { userGroups: UserGroupSection[]; modelGroups: ModelSection[] };

/** An empty set reads as visible: nothing in it is hidden. */
export function eyeState(items: readonly { hidden: boolean }[]): EyeState {
  const hidden = items.filter((item) => item.hidden).length;
  if (hidden === 0) return "visible";
  return hidden === items.length ? "hidden" : "mixed";
}

/**
 * The panel's two halves (G-2): user groups alphabetically, then one row per
 * model holding only what no group claims. It takes `groupByModel`'s output so
 * `#N` stays the model's numbering — moving a placement never renames it. A
 * `groupId` naming no group this list knows counts as none.
 */
export function groupPlacements(byModel: ModelGroup[], groups: PlacementGroup[]): PlacementSections {
  const members = new Map<number, UserGroupSection["members"]>(groups.map((g) => [g.id, []]));
  const modelGroups: ModelSection[] = [];
  for (const group of byModel) {
    const shown: PlacementInstance[] = [];
    for (const instance of group.instances) {
      const bucket = instance.groupId === null ? undefined : members.get(instance.groupId);
      if (bucket) bucket.push({ model: group, instance });
      else shown.push(instance);
    }
    if (shown.length > 0) modelGroups.push({ group, shown });
  }
  const userGroups = [...groups]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((group) => ({ group, members: members.get(group.id)! }));
  return { userGroups, modelGroups };
}

// ponytail: shares the panel's one `expandedModel` string with model slugs; a
// model slugged literally "group:<n>" would open with that group. Only the fold
// is shared, never data — split the state if that ever happens.
/** The panel's open-row key for a user group. */
export const userGroupKey = (id: number) => `group:${id}`;

/** "3 objects · storage-tank-500 #2 selected" — a group mixes models, so it names the whole instance. */
export function userGroupLine(section: UserGroupSection, selectedId: number | null): string {
  const n = section.members.length;
  if (n === 0) return "No objects yet";
  const count = `${n} ${n === 1 ? "object" : "objects"}`;
  const selected = section.members.find((m) => m.instance.id === selectedId);
  return selected ? `${count} · ${instanceName(selected.model, selected.instance)} selected` : count;
}

export function matchesUserGroup(section: UserGroupSection, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    section.group.title.toLowerCase().includes(q) ||
    section.members.some(({ model, instance }) => matchesObjects({ model: model.model, instances: [instance] }, q))
  );
}
