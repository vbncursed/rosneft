import { groupPlacements, type ModelGroup } from "@/entities/placement";
import type { PlacementsPanelProps } from "@/widgets/placements-panel";
import { selectedBlock, visibilityBlock } from "./page-props-selected";
import type { PageParts } from "./viewer-props";

/**
 * The Placements tab, split out of `page-props.ts` at the 200-line cap.
 * `groups` is `groupByModel` over every placement — the one numbering the
 * list, the markers and the Selected block all name instances by.
 */
export function placementsPanelProps(p: PageParts, groups: ModelGroup[]): PlacementsPanelProps {
  const { mode, grants, view, on, placementGroups } = p;
  const selected = p.placements.find((x) => x.id === mode.selectedId) ?? null;
  return {
    sections: groupPlacements(groups, placementGroups.list),
    query: view.query,
    onQuery: on.onQuery,
    expandedModel: view.expandedModel,
    onToggleGroup: on.onToggleGroup,
    selectedId: mode.selectedId,
    onSelect: on.onSelect,
    pendingIds: p.pendingIds,
    grants: { create: grants.create, write: grants.write, delete: grants.delete },
    onAdd: on.onAdd,
    onRename: on.onRename,
    onDelete: on.onDelete,
    onFocus: on.onFocus,
    onSetHidden: on.onSetHidden,
    onMoveToGroup: on.onMoveToGroup,
    onAddToGroup: on.onAddToGroup,
    groupActions: {
      busy: placementGroups.busy,
      onCreate: placementGroups.create,
      onRename: placementGroups.rename,
      onDelete: placementGroups.remove,
    },
    selected: selectedBlock(p, groups, selected),
    // B-5: inside a panorama nothing is placed.
    canAdd: mode.view.kind !== "panorama",
    visibility: visibilityBlock(p, selected),
  };
}
