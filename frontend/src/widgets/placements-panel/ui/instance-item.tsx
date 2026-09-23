import { InstanceRow, type ModelGroup, type PlacementGroup, type PlacementInstance } from "@/entities/placement";
import type { PlacementGrants } from "../model/panel-copy";
import { VisibleIn } from "./visible-in";

/** The selected instance's per-panorama allowlist, and how to change it. Panorama mode only. */
export type PlacementVisibility = {
  panoramas: { id: number; title: string }[];
  visiblePanoramaIds: number[];
  onToggle: (placementId: number, panoramaId: number, visible: boolean) => void;
};

/** What every row of the panel reads, built once by the panel and handed down unchanged. */
export type RowContext = {
  /** The open row's key: a model slug, or `userGroupKey(id)`. */
  expanded: string | null;
  onToggleGroup: (key: string) => void;
  selectedId: number | null;
  pendingIds: number[];
  grants: PlacementGrants;
  /** The territory's groups — the move menu's targets. */
  groups: PlacementGroup[];
  visibility: PlacementVisibility | null;
  onSelect: (id: number | null) => void;
  onRename: (id: number) => void;
  onDelete: (id: number) => void;
  onFocus: (id: number) => void;
  onSetHidden: (ids: number[], hidden: boolean) => void;
  onMoveToGroup: (ids: number[], groupId: number | null) => void;
};

/** One instance under a model row or a user group, with Visible in under it when it is the selection. */
export function InstanceItem({ model, instance, ctx }: { model: ModelGroup; instance: PlacementInstance; ctx: RowContext }) {
  const selected = instance.id === ctx.selectedId;
  const pending = ctx.pendingIds.includes(instance.id);
  return (
    <li>
      <InstanceRow
        group={model}
        instance={instance}
        selected={selected}
        pending={pending}
        canWrite={ctx.grants.write}
        canDelete={ctx.grants.delete}
        groups={ctx.groups}
        onSelect={ctx.onSelect}
        onRename={ctx.onRename}
        onDelete={ctx.onDelete}
        onFocus={ctx.onFocus}
        onHide={(id, hidden) => ctx.onSetHidden([id], hidden)}
        onMove={(id, groupId) => ctx.onMoveToGroup([id], groupId)}
      />
      {ctx.visibility && selected ? (
        <VisibleIn
          placement={{ id: instance.id, visiblePanoramaIds: ctx.visibility.visiblePanoramaIds }}
          panoramas={ctx.visibility.panoramas}
          pending={pending}
          onToggle={(panoramaId, visible) => ctx.visibility!.onToggle(instance.id, panoramaId, visible)}
        />
      ) : null}
    </li>
  );
}
