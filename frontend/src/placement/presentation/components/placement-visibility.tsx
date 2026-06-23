import { useCallback } from "react";
import type { Panorama } from "@/panorama/domain/panorama";

interface PlacementVisibilityProps {
  panoramas: Panorama[];
  // The selected placement's current allowlist.
  visibleIds: number[];
  pending: boolean;
  onChange: (panoramaIds: number[]) => void;
}

// PlacementVisibility is the per-panorama allowlist editor shown under the
// transform form when a placement is selected. Each panorama is a checkbox:
// checked = the placement renders in that panorama. The 3D view always shows
// the placement regardless, so this only governs panorama mode.
export default function PlacementVisibility({
  panoramas,
  visibleIds,
  pending,
  onChange,
}: PlacementVisibilityProps) {
  const toggle = useCallback(
    (id: number, checked: boolean) => {
      const next = checked
        ? [...new Set([...visibleIds, id])]
        : visibleIds.filter((v) => v !== id);
      onChange(next);
    },
    [visibleIds, onChange],
  );

  if (panoramas.length === 0) return null;

  return (
    <fieldset className="flex flex-col gap-1.5 rounded-md border border-white/15 px-3 py-2">
      <legend className="px-1 text-[10px] uppercase tracking-wider text-neutral-400">
        Visible in panoramas
      </legend>
      {panoramas.map((p) => {
        const checked = visibleIds.includes(p.id);
        return (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-2 text-[11px] text-neutral-200"
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={pending}
              onChange={(e) => toggle(p.id, e.target.checked)}
              className="size-3.5 cursor-pointer accent-cyan-400 disabled:cursor-not-allowed"
            />
            <span className="truncate">{p.title || p.slug}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
