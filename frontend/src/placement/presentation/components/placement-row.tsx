import { memo, useCallback } from "react";
import type { ResolvedPlacement } from "@/placement/domain/placement";

interface PlacementRowProps {
  placement: ResolvedPlacement;
  selected: boolean;
  pending: boolean;
  // Parent-level handlers — same identity for every row, so memo on this
  // component holds across re-renders. The row internally closes over
  // its own placement.id, so the panel doesn't have to allocate a fresh
  // arrow per item on every render.
  onSelect: (id: number | null) => void;
  onDelete: (id: number) => void;
}

function PlacementRowImpl({
  placement,
  selected,
  pending,
  onSelect,
  onDelete,
}: PlacementRowProps) {
  const headline = placement.label || placement.modelSlug;

  const handleSelect = useCallback(() => {
    // Click on a selected row toggles the selection off — the same
    // behaviour the panel had when it owned the wrapper arrow.
    onSelect(selected ? null : placement.id);
  }, [onSelect, selected, placement.id]);

  const handleDelete = useCallback(() => {
    onDelete(placement.id);
  }, [onDelete, placement.id]);

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
        selected
          ? "border-white/40 bg-white/[0.08]"
          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
      }`}
    >
      <button
        type="button"
        onClick={handleSelect}
        className="flex-1 cursor-pointer text-left"
      >
        <p className="truncate text-sm font-medium text-neutral-100">{headline}</p>
        <p className="truncate text-[11px] text-neutral-400">
          {placement.modelSlug} · #{placement.id}
        </p>
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="cursor-pointer rounded-md border border-red-300/30 px-2 py-1 text-[11px] text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Delete placement ${headline}`}
      >
        Remove
      </button>
    </div>
  );
}

export default memo(PlacementRowImpl);
