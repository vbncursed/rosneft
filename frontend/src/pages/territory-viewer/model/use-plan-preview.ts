import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PlanRect, Similarity } from "@/entities/site-plan";
import { previewOutlines } from "@/features/zone-editor";
import type { Zone } from "@/entities/zone";
import type { PlanPreview } from "@/widgets/viewer-canvas";

export type PlanPreviewParams = Omit<Parameters<typeof previewOutlines>[0], "fit"> & {
  /** Null while the pairs do not give a fit. */
  similarity: Similarity | null;
  selected: number | null;
  /** The picked rectangle's size label. */
  label: string | null;
  selectRect: (index: number) => void;
  zones: Zone[];
  rects: PlanRect[];
};

/**
 * What the canvas draws of the editor's rectangles: null until there is a fit
 * and something to draw, then one object whose identity moves only with the
 * rectangles, the fit, the ground, the zones, the pick or its label. The editor
 * re-derives its fit and its select handler on every render, so both are read
 * through numbers and a ref (the page publishes this, and a new object per
 * render would publish again forever).
 */
export function usePlanPreview(p: PlanPreviewParams): PlanPreview | null {
  const { rects, groundAt, fallbackY, zones, unitRatio, selected, label } = p;
  const [scale, rotation, tx, tz] = [p.similarity?.scale, p.similarity?.rotation, p.similarity?.tx, p.similarity?.tz];
  const outlines = useMemo(
    () =>
      scale === undefined || rotation === undefined || tx === undefined || tz === undefined
        ? null
        : previewOutlines({ rects, fit: { scale, rotation, tx, tz }, groundAt, fallbackY, zones, unitRatio }),
    [rects, scale, rotation, tx, tz, groundAt, fallbackY, zones, unitRatio],
  );

  const latest = useRef(p.selectRect);
  useEffect(() => {
    latest.current = p.selectRect;
  });
  const onSelect = useCallback((index: number) => latest.current(index), []);

  return useMemo(
    () => (outlines && outlines.length > 0 ? { outlines, selected, label, onSelect } : null),
    [outlines, selected, label, onSelect],
  );
}
