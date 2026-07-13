import { useState } from "react";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import Checkbox from "@/shared/presentation/components/checkbox";

interface ObjectsListProps {
  placements: ResolvedPlacement[];
  selectedId: number | null;
  // When a panorama is active, each row gets a "show in this panorama" toggle.
  activePanoramaId: number | null;
  isPending: (id: number) => boolean;
  // Permission flags: write gates rename + per-panorama visibility, delete gates
  // the trash icon. Selecting a row to highlight it stays available to everyone.
  canWrite: boolean;
  canDelete: boolean;
  onSelect: (id: number | null) => void;
  onRename: (id: number, label: string) => void;
  onToggleVisible: (id: number, visible: boolean) => void;
  onDelete: (id: number) => void;
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

const ICON_BTN =
  "shrink-0 cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

// One object row. The name is text: clicking it selects the object (clicking
// again deselects), so it highlights in the scene. The pencil opens inline
// editing of the object's single territory-level name; the trash deletes.
// Both icon buttons carry a title so hovering explains them.
function ObjectRow({
  placement,
  selected,
  activePanoramaId,
  pending,
  canWrite,
  canDelete,
  onSelect,
  onRename,
  onToggleVisible,
  onDelete,
}: {
  placement: ResolvedPlacement;
  selected: boolean;
  activePanoramaId: number | null;
  pending: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onSelect: (id: number | null) => void;
  onRename: (id: number, label: string) => void;
  onToggleVisible: (id: number, visible: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(placement.label);

  const commit = () => {
    setEditing(false);
    if (name.trim() !== placement.label) onRename(placement.id, name.trim());
  };
  const cancel = () => {
    setName(placement.label);
    setEditing(false);
  };

  return (
    <li
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
        selected
          ? "border-cyan-400/60 bg-cyan-400/10"
          : "border-white/10 hover:border-white/25"
      }`}
    >
      {activePanoramaId != null && canWrite ? (
        <span className="shrink-0" title="Show in this panorama">
          <Checkbox
            checked={placement.visiblePanoramaIds.includes(activePanoramaId)}
            disabled={pending}
            onChange={(next) => onToggleVisible(placement.id, next)}
            ariaLabel="Show in this panorama"
          />
        </span>
      ) : null}

      {editing ? (
        <input
          type="text"
          autoFocus
          value={name}
          disabled={pending}
          placeholder={placement.modelSlug}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") cancel();
          }}
          className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-[12px] text-neutral-100 outline-none focus:border-cyan-400/60"
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect(selected ? null : placement.id)}
          title={selected ? "Click to deselect" : "Click to select"}
          className="min-w-0 flex-1 cursor-pointer truncate px-1 text-left text-[12px] text-neutral-100"
        >
          {placement.label || (
            <span className="text-neutral-500">{placement.modelSlug}</span>
          )}
        </button>
      )}

      {canWrite ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={pending || editing}
          title="Rename"
          aria-label="Rename object"
          className={ICON_BTN + " hover:text-cyan-300"}
        >
          <PencilIcon />
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          onClick={() => onDelete(placement.id)}
          disabled={pending}
          title="Delete"
          aria-label="Delete object"
          className={ICON_BTN + " hover:text-red-400"}
        >
          <TrashIcon />
        </button>
      ) : null}
    </li>
  );
}

// ObjectsList is the territory's models list: name each object once (a single
// territory-level name) so you can tell which is which, and — while a panorama
// is active — pick which appear in it.
export default function ObjectsList({
  placements,
  selectedId,
  activePanoramaId,
  isPending,
  canWrite,
  canDelete,
  onSelect,
  onRename,
  onToggleVisible,
  onDelete,
}: ObjectsListProps) {
  if (placements.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-white/15 px-3 py-2 text-[11px] text-neutral-400">
        No objects on this territory yet. Add one above.
      </p>
    );
  }

  return (
    <ul data-tour="objects-list" className="flex flex-col gap-1.5">
      {placements.map((p) => (
        <ObjectRow
          key={`${p.id}:${p.label}`}
          placement={p}
          selected={p.id === selectedId}
          activePanoramaId={activePanoramaId}
          pending={isPending(p.id)}
          canWrite={canWrite}
          canDelete={canDelete}
          onSelect={onSelect}
          onRename={onRename}
          onToggleVisible={onToggleVisible}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
