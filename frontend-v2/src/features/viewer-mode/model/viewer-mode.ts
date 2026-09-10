export type ViewerMode = "orbit" | "place" | "measure";
export type GizmoMode = "translate" | "rotate" | "scale";

export type ViewerModeState = {
  mode: ViewerMode;
  selectedId: number | null;
  gizmo: GizmoMode;
  /** Surface magnetism for the translate gizmo; off, the surface is a floor. */
  snap: boolean;
};

export const INITIAL_VIEWER_MODE: ViewerModeState = {
  mode: "orbit",
  selectedId: null,
  gizmo: "translate",
  snap: false,
};

export type ViewerModeAction =
  | { type: "toggleMeasure" }
  | { type: "exitMeasure" }
  | { type: "setGizmo"; gizmo: GizmoMode }
  | { type: "toggleSnap" }
  | { type: "select"; id: number | null }
  | { type: "enterPlace" }
  | { type: "exitPlace" }
  /** chainOpen: the measure tool still has a chain to break — that press is its, not ours. */
  | { type: "escape"; chainOpen: boolean };

/**
 * The scene's mutually exclusive interaction modes and the selection. Pure,
 * so every key and click is one table row: entering measure drops the gizmo
 * target (a stray drag must not move a placement), selecting leaves measure
 * and place, and Escape peels one layer at a time.
 */
export function viewerModeReducer(state: ViewerModeState, action: ViewerModeAction): ViewerModeState {
  switch (action.type) {
    case "toggleMeasure":
      return state.mode === "measure"
        ? { ...state, mode: "orbit" }
        : { ...state, mode: "measure", selectedId: null };
    case "exitMeasure":
      return state.mode === "measure" ? { ...state, mode: "orbit" } : state;
    case "setGizmo":
      return { ...state, gizmo: action.gizmo };
    case "toggleSnap":
      return { ...state, snap: !state.snap };
    case "select":
      return action.id === null
        ? { ...state, selectedId: null }
        : { ...state, mode: "orbit", selectedId: action.id };
    case "enterPlace":
      return { ...state, mode: "place", selectedId: null };
    case "exitPlace":
      return state.mode === "place" ? { ...state, mode: "orbit" } : state;
    case "escape":
      if (action.chainOpen) return state;
      if (state.selectedId !== null) return { ...state, selectedId: null };
      return state.mode === "orbit" ? state : { ...state, mode: "orbit" };
  }
}
