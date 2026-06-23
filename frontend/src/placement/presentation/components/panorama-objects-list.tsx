import { useState } from "react";
import type { ResolvedPlacement } from "@/placement/domain/placement";

interface PanoramaObjectsListProps {
  placements: ResolvedPlacement[];
  panoramaId: number;
  isPending: (id: number) => boolean;
  onToggleVisible: (id: number, visible: boolean) => void;
  onRename: (id: number, label: string) => void;
}

function labelFor(p: ResolvedPlacement, panoramaId: number): string {
  return p.panoramaLabels.find((l) => l.panoramaId === panoramaId)?.label ?? "";
}

// One object: a "show in this panorama" toggle plus an inline name that is
// scoped to this panorama. The name commits on blur (or Enter); the row is
// re-keyed by the server label upstream so an external change re-seeds it.
function ObjectRow({
  placement,
  panoramaId,
  pending,
  onToggleVisible,
  onRename,
}: {
  placement: ResolvedPlacement;
  panoramaId: number;
  pending: boolean;
  onToggleVisible: (id: number, visible: boolean) => void;
  onRename: (id: number, label: string) => void;
}) {
  const initial = labelFor(placement, panoramaId);
  const [name, setName] = useState(initial);
  const visible = placement.visiblePanoramaIds.includes(panoramaId);

  const commit = () => {
    if (name !== initial) onRename(placement.id, name.trim());
  };

  return (
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={visible}
        disabled={pending}
        onChange={(e) => onToggleVisible(placement.id, e.target.checked)}
        className="size-3.5 shrink-0 cursor-pointer accent-cyan-400 disabled:cursor-not-allowed"
        aria-label="Show in this panorama"
      />
      <input
        type="text"
        value={name}
        disabled={pending}
        placeholder={placement.modelSlug}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-neutral-100 outline-none focus:border-cyan-400/60 disabled:opacity-50"
      />
    </li>
  );
}

// PanoramaObjectsList is the per-panorama management surface shown while a
// panorama is active: pick which objects appear in it and name each one for
// this panorama specifically.
export default function PanoramaObjectsList({
  placements,
  panoramaId,
  isPending,
  onToggleVisible,
  onRename,
}: PanoramaObjectsListProps) {
  if (placements.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-white/15 px-3 py-2 text-[11px] text-neutral-400">
        No objects on this territory yet.
      </p>
    );
  }

  return (
    <fieldset className="flex flex-col gap-1.5 rounded-md border border-white/15 px-3 py-2">
      <legend className="px-1 text-[10px] uppercase tracking-wider text-neutral-400">
        Objects in this panorama
      </legend>
      <ul className="flex flex-col gap-1.5">
        {placements.map((p) => (
          <ObjectRow
            key={`${p.id}:${labelFor(p, panoramaId)}`}
            placement={p}
            panoramaId={panoramaId}
            pending={isPending(p.id)}
            onToggleVisible={onToggleVisible}
            onRename={onRename}
          />
        ))}
      </ul>
    </fieldset>
  );
}
