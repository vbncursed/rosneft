import {
  GroupRow,
  InstanceRow,
  matchesObjects,
  type PlacementGroup,
} from "@/entities/placement";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/card";
import { Icon } from "@/shared/ui/icon";
import { SearchField } from "@/shared/ui/search-field";
import {
  ADD_LABEL,
  EMPTY_BODY,
  EMPTY_TITLE,
  footerFor,
  type PlacementGrants,
} from "../model/panel-copy";
import { SelectedBlock, type SelectedBlockProps } from "./selected-block";
import { VisibleIn } from "./visible-in";

/** The selected instance's per-panorama allowlist, and how to change it. Panorama mode only. */
export type PlacementVisibility = {
  panoramas: { id: number; title: string }[];
  visiblePanoramaIds: number[];
  onToggle: (placementId: number, panoramaId: number, visible: boolean) => void;
};

export type PlacementsPanelProps = {
  groups: PlacementGroup[];
  query: string;
  onQuery: (query: string) => void;
  expandedModel: string | null;
  onToggleGroup: (slug: string) => void;
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
  /** The block under the list, when something is selected. */
  selected: SelectedBlockProps | null;
  /** False inside a panorama (B-5): the Add button is not drawn, anywhere. */
  canAdd?: boolean;
  /** The Visible in block for the selected instance; null outside panorama mode. */
  visibility?: PlacementVisibility | null;
};

/**
 * The Overlays panel's Placements tab: search, one row per model, the
 * instances of the open one, and the selected object's transform underneath.
 *
 * It scrolls in the panel body it is rendered into and adds no scrolling
 * container of its own.
 */
export function PlacementsPanel({
  groups,
  query,
  onQuery,
  expandedModel,
  onToggleGroup,
  selectedId,
  onSelect,
  pendingIds,
  grants,
  onAdd,
  onRename,
  onDelete,
  onFocus,
  selected,
  canAdd = true,
  visibility = null,
}: PlacementsPanelProps) {
  const shown = groups.filter((group) => matchesObjects(group, query));
  const footer = footerFor(grants);

  // The selection wins over the open model: a placement selected in the scene
  // has to be reachable in the list, whichever group the reader last opened.
  const isOpen = (group: PlacementGroup) =>
    expandedModel === group.model.slug || group.instances.some((i) => i.id === selectedId);

  const addButton = grants.create && canAdd ? (
    <Button variant="primary" onClick={onAdd} className="w-full">
      <Icon name="plus" size={14} />
      {ADD_LABEL}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-3.5">
      <SearchField
        value={query}
        onChange={onQuery}
        label="Search objects"
        placeholder="Search objects"
      />

      {groups.length === 0 ? (
        <EmptyState
          layout="panel"
          icon="cube"
          title={EMPTY_TITLE}
          description={EMPTY_BODY}
          action={addButton}
        />
      ) : (
        <>
          <ul role="list" aria-label="Objects" className="m-0 flex list-none flex-col gap-1.5 p-0">
            {shown.map((group) => (
              <li key={group.model.slug}>
                <GroupRow
                  group={group}
                  expanded={isOpen(group)}
                  selectedId={selectedId}
                  onToggle={() => onToggleGroup(group.model.slug)}
                />
                {isOpen(group) ? (
                  <ul role="list" className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
                    {group.instances.map((instance) => (
                      <li key={instance.id}>
                        <InstanceRow
                          group={group}
                          instance={instance}
                          selected={instance.id === selectedId}
                          pending={pendingIds.includes(instance.id)}
                          canWrite={grants.write}
                          canDelete={grants.delete}
                          onSelect={onSelect}
                          onRename={onRename}
                          onDelete={onDelete}
                          onFocus={onFocus}
                        />
                        {visibility && instance.id === selectedId ? (
                          <VisibleIn
                            placement={{ id: instance.id, visiblePanoramaIds: visibility.visiblePanoramaIds }}
                            panoramas={visibility.panoramas}
                            pending={pendingIds.includes(instance.id)}
                            onToggle={(panoramaId, visible) =>
                              visibility.onToggle(instance.id, panoramaId, visible)
                            }
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {addButton}
        </>
      )}

      {selected ? (
        <div className="border-t border-line pt-3.5">
          <SelectedBlock {...selected} />
        </div>
      ) : null}

      {footer ? <p className="m-0 mt-1 text-[11px] leading-[1.55] text-muted">{footer}</p> : null}
    </div>
  );
}
