import { ObjectRow, isVisibleIn, type Placement } from "@/entities/placement";

export type ObjectsPanelProps = {
  placements: Placement[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onRename: (id: number, label: string) => void;
  onDelete: (id: number) => void;
  /** Non-null while a panorama is open; each row then gets a visibility box. */
  activePanoramaId?: number | null;
  onToggleVisible?: (id: number, visible: boolean) => void;
  canWrite?: boolean;
  canDelete?: boolean;
  pendingIds?: number[];
};

export function ObjectsPanel({
  placements,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  activePanoramaId = null,
  onToggleVisible,
  canWrite = true,
  canDelete = true,
  pendingIds = [],
}: ObjectsPanelProps) {
  if (placements.length === 0) {
    return (
      <p className="m-0 rounded-control border border-dashed border-line-2 px-3 py-[9px] text-[11px] text-muted">
        No objects on this territory yet.
      </p>
    );
  }

  const inPanorama = activePanoramaId !== null && onToggleVisible !== undefined;

  return (
    <ul aria-label="Objects" className="m-0 flex list-none flex-col gap-3 p-0">
      {placements.map((placement) => (
        <li key={placement.id}>
          <ObjectRow
            placement={placement}
            selected={placement.id === selectedId}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            canWrite={canWrite}
            canDelete={canDelete}
            pending={pendingIds.includes(placement.id)}
            {...(inPanorama
              ? {
                  visibleInPanorama: isVisibleIn(placement, activePanoramaId),
                  onToggleVisible,
                }
              : {})}
          />
        </li>
      ))}
    </ul>
  );
}
