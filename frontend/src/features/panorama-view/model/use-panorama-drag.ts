import { useCallback, useRef, useState } from "react";
import { IDLE, begin, dropTarget, move, type DragState } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";

// usePanoramaDrag owns the transient state of the marker currently being
// dragged. `onCommit` persists the drop (the optimistic PUT lives in
// usePanoramaList.update). The move sub-mode itself belongs to the viewer-mode
// reducer; leaving it calls reset(), which clears an in-flight drag WITHOUT
// committing.
//
// The live DragState is mirrored in a ref so end() can read the latest drop
// point without putting a side effect inside a setState updater (which React
// 19 StrictMode double-invokes — that would double-PUT).
export function usePanoramaDrag(onCommit: (id: number, position: Vec3) => void) {
  const [drag, setDrag] = useState<DragState>(IDLE);
  const dragRef = useRef<DragState>(IDLE);

  const apply = useCallback((next: DragState) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const reset = useCallback(() => apply(IDLE), [apply]);

  const beginDrag = useCallback((id: number) => apply(begin(id)), [apply]);

  const moveDrag = useCallback((point: Vec3) => apply(move(dragRef.current, point)), [apply]);

  const endDrag = useCallback(() => {
    const target = dropTarget(dragRef.current);
    if (target) onCommit(target.id, target.position);
    apply(IDLE);
  }, [apply, onCommit]);

  return {
    draggingId: drag.draggingId,
    livePos: drag.livePos,
    begin: beginDrag,
    move: moveDrag,
    end: endDrag,
    reset,
  };
}

// The hook's public surface, threaded through the R3F scene as one cohesive
// "panorama move" prop instead of five loose primitives.
export type PanoramaDragApi = ReturnType<typeof usePanoramaDrag>;
