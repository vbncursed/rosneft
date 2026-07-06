import type { Vec3 } from "@/shared/domain/vec3";

// Transient state of dragging one panorama marker across the mesh. Pure
// transitions so the interaction logic is testable without React / R3F.
// Mirrors placement/domain/mutation-state.ts (pure state + constructors).
export interface DragState {
  // Panorama id currently grabbed, or null when nothing is being dragged.
  draggingId: number | null;
  // Last valid surface point under the cursor; null until the first move.
  livePos: Vec3 | null;
}

export const IDLE: DragState = { draggingId: null, livePos: null };

export function begin(id: number): DragState {
  return { draggingId: id, livePos: null };
}

// A move only registers while a marker is grabbed; otherwise it's ignored.
export function move(state: DragState, point: Vec3): DragState {
  return state.draggingId === null
    ? state
    : { draggingId: state.draggingId, livePos: point };
}

// The commit target read on pointer-up: id + position, or null when the
// grab produced no surface point (a plain click) so nothing is persisted.
export function dropTarget(
  state: DragState,
): { id: number; position: Vec3 } | null {
  return state.draggingId !== null && state.livePos !== null
    ? { id: state.draggingId, position: state.livePos }
    : null;
}
