import { useState } from "react";
import type { ResolvedPlacement } from "@/placement/domain/placement";

interface ObjectsListProps {
  placements: ResolvedPlacement[];
  selectedId: number | null;
  // When a panorama is active, each row gets a "show in this panorama" toggle.
  activePanoramaId: number | null;
  isPending: (id: number) => boolean;
  onSelect: (id: number | null) => void;
  onRename: (id: number, label: string) => void;
  onToggleVisible: (id: number, visible: boolean) => void;
  onDelete: (id: number) => void;
}

// One object row: an inline territory-level name (the object's single name,
// shown everywhere), an optional per-panorama visibility toggle, and delete.
// Focusing the name selects the object so it highlights in the scene; the
// name commits on blur (or Enter). The row is re-keyed by the label upstream
// so an external rename re-seeds the input.
function ObjectRow({
  placement,
  selected,
  activePanoramaId,
  pending,
  onSelect,
  onRename,
  onToggleVisible,
  onDelete,
}: {
  placement: ResolvedPlacement;
  selected: boolean;
  activePanoramaId: number | null;
  pending: boolean;
  onSelect: (id: number | null) => void;
  onRename: (id: number, label: string) => void;
  onToggleVisible: (id: number, visible: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [name, setName] = useState(placement.label);
  const commit = () => {
    if (name.trim() !== placement.label) onRename(placement.id, name.trim());
  };

  return (
    <li
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
        selected
          ? "border-cyan-400/60 bg-cyan-400/10"
          : "border-white/10 hover:border-white/25"
      }`}
    >
      {activePanoramaId != null ? (
        <input
          type="checkbox"
          checked={placement.visiblePanoramaIds.includes(activePanoramaId)}
          disabled={pending}
          onChange={(e) => onToggleVisible(placement.id, e.target.checked)}
          className="size-3.5 shrink-0 cursor-pointer accent-cyan-400 disabled:cursor-not-allowed"
          aria-label="Show in this panorama"
        />
      ) : null}
      <input
        type="text"
        value={name}
        disabled={pending}
        placeholder={placement.modelSlug}
        onFocus={() => onSelect(placement.id)}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-neutral-100 outline-none focus:border-white/15 focus:bg-black/30"
      />
      <button
        type="button"
        onClick={() => onDelete(placement.id)}
        disabled={pending}
        aria-label="Delete object"
        className="shrink-0 cursor-pointer rounded px-1 text-[12px] text-neutral-500 transition-colors hover:text-red-400 disabled:cursor-not-allowed"
      >
        ✕
      </button>
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
    <ul className="flex flex-col gap-1.5">
      {placements.map((p) => (
        <ObjectRow
          key={`${p.id}:${p.label}`}
          placement={p}
          selected={p.id === selectedId}
          activePanoramaId={activePanoramaId}
          pending={isPending(p.id)}
          onSelect={onSelect}
          onRename={onRename}
          onToggleVisible={onToggleVisible}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
