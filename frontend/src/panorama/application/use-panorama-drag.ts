import { useCallback, useRef, useState } from "react";
import type { Vec3 } from "@/shared/domain/vec3";
import {
  IDLE,
  begin,
  move,
  dropTarget,
  type DragState,
} from "@/panorama/domain/marker-drag";

// usePanoramaDrag owns the "Move" sub-mode plus the transient state of the
// marker currently being dragged. `onCommit` persists the drop (optimistic
// PUT lives in usePanoramas.update). Toggling the mode off — or exit() /
// Esc — clears any in-flight drag WITHOUT committing.
//
// The live DragState is mirrored in a ref so end() can read the latest
// drop point without putting a side effect inside a setState updater
// (which React 19 StrictMode double-invokes — that would double-PUT).
export function usePanoramaDrag(
  onCommit: (id: number, position: Vec3) => void,
) {
  const [moveMode, setMoveMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(IDLE);
  const dragRef = useRef<DragState>(IDLE);

  const apply = useCallback((next: DragState) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const toggle = useCallback(() => {
    setMoveMode((v) => !v);
    apply(IDLE);
  }, [apply]);

  const exit = useCallback(() => {
    setMoveMode(false);
    apply(IDLE);
  }, [apply]);

  const beginDrag = useCallback((id: number) => apply(begin(id)), [apply]);

  const moveDrag = useCallback(
    (point: Vec3) => apply(move(dragRef.current, point)),
    [apply],
  );

  const endDrag = useCallback(() => {
    const target = dropTarget(dragRef.current);
    if (target) onCommit(target.id, target.position);
    apply(IDLE);
  }, [apply, onCommit]);

  return {
    moveMode,
    draggingId: drag.draggingId,
    livePos: drag.livePos,
    toggle,
    exit,
    begin: beginDrag,
    move: moveDrag,
    end: endDrag,
  };
}
