import { matchesObjects, matchesUserGroup, type PlacementSections } from "@/entities/placement";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import { SearchField } from "@/shared/ui/search-field";
import { ADD_LABEL, EMPTY_BODY, EMPTY_TITLE, footerFor, type PlacementGrants } from "../model/panel-copy";
import { NewGroup } from "./group-title-field";
import type { PlacementVisibility, RowContext } from "./instance-item";
import { ModelSectionItem } from "./model-section-item";
import { SelectedBlock, type SelectedBlockProps } from "./selected-block";
import { UserGroupItem, type GroupActions } from "./user-group-item";

export type { GroupActions } from "./user-group-item";
export type { PlacementVisibility } from "./instance-item";

export type PlacementsPanelProps = {
  /** User groups, then the model rows of what no group holds (`groupPlacements`). */
  sections: PlacementSections;
  query: string;
  onQuery: (query: string) => void;
  /** The open row: a model slug, or `userGroupKey(id)`. */
  expandedModel: string | null;
  onToggleGroup: (key: string) => void;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Instances with a mutation in flight; their row controls wait. */
  pendingIds: number[];
  grants: PlacementGrants;
  /** Opens the model picker. */
  onAdd: () => void;
  onRename: (id: number) => void;
  onDelete: (id: number) => void;
  onFocus: (id: number) => void;
  /** Hides or shows every id in one write (G-3). */
  onSetHidden: (ids: number[], hidden: boolean) => void;
  onMoveToGroup: (ids: number[], groupId: number | null) => void;
  /** Opens the model picker aimed at one user group (G-4). */
  onAddToGroup: (groupId: number) => void;
  groupActions: GroupActions;
  /** The block under the list, when something is selected. */
  selected: SelectedBlockProps | null;
  /** False inside a panorama (B-5): no Add is drawn, anywhere. */
  canAdd?: boolean;
  /** The Visible in block for the selected instance; null outside panorama mode. */
  visibility?: PlacementVisibility | null;
};

const LIST = "m-0 flex list-none flex-col gap-1.5 p-0";

/**
 * The Overlays panel's Placements tab: search, user groups, a rule, one row
 * per model for what no group holds, Add, New group, and the selected object's
 * transform underneath. It scrolls in the panel body it is rendered into.
 */
export function PlacementsPanel(props: PlacementsPanelProps) {
  const { sections, query, grants, groupActions, selected, canAdd = true, visibility = null } = props;
  const ctx: RowContext = {
    expanded: props.expandedModel,
    onToggleGroup: props.onToggleGroup,
    selectedId: props.selectedId,
    pendingIds: props.pendingIds,
    grants,
    groups: sections.userGroups.map((s) => s.group),
    visibility,
    onSelect: props.onSelect,
    onRename: props.onRename,
    onDelete: props.onDelete,
    onFocus: props.onFocus,
    onSetHidden: props.onSetHidden,
    onMoveToGroup: props.onMoveToGroup,
  };
  const userGroups = sections.userGroups.filter((s) => matchesUserGroup(s, query));
  const modelGroups = sections.modelGroups.filter((s) =>
    matchesObjects({ model: s.group.model, instances: s.shown }, query),
  );
  const empty = sections.userGroups.length === 0 && sections.modelGroups.length === 0;
  const placing = grants.create && canAdd;
  const footer = footerFor(grants);

  const addButton = placing ? (
    <Button variant="primary" onClick={props.onAdd} className="w-full">
      <Icon name="plus" size={14} />
      {ADD_LABEL}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-3.5">
      <SearchField value={query} onChange={props.onQuery} label="Search objects" placeholder="Search objects" />

      {empty ? (
        <EmptyState layout="panel" icon="cube" title={EMPTY_TITLE} description={EMPTY_BODY} action={addButton} />
      ) : (
        <>
          {userGroups.length > 0 ? (
            <ul role="list" aria-label="Groups" className={LIST}>
              {userGroups.map((section) => (
                <UserGroupItem
                  key={section.group.id}
                  section={section}
                  ctx={ctx}
                  onAdd={placing ? props.onAddToGroup : null}
                  actions={groupActions}
                />
              ))}
            </ul>
          ) : null}
          {userGroups.length > 0 && modelGroups.length > 0 ? <hr className="m-0 border-0 border-t border-line" /> : null}
          {modelGroups.length > 0 ? (
            <ul role="list" aria-label="Objects" className={LIST}>
              {modelGroups.map((section) => (
                <ModelSectionItem key={section.group.model.slug} section={section} ctx={ctx} />
              ))}
            </ul>
          ) : null}
          {addButton}
        </>
      )}

      {grants.write ? <NewGroup busy={groupActions.busy} onCreate={groupActions.onCreate} /> : null}

      {selected ? (
        <div className="border-t border-line pt-3.5">
          <SelectedBlock {...selected} />
        </div>
      ) : null}

      {footer ? <p className="m-0 mt-1 text-[11px] leading-[1.55] text-muted">{footer}</p> : null}
    </div>
  );
}
