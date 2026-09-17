export type ViewerMode = "orbit" | "place" | "measure";
export type GizmoMode = "translate" | "rotate" | "scale";
export type ViewerView = { kind: "scene" } | { kind: "panorama"; id: number };

export type ViewerModeState = {
  mode: ViewerMode;
  selectedId: number | null;
  gizmo: GizmoMode;
  /** Surface magnetism for the translate gizmo; off, the surface is a floor. */
  snap: boolean;
  /** Where the camera is: the scene, or inside one panorama. */
  view: ViewerView;
  /** Drag panorama points (V). A scene-only sub-mode of orbit. */
  move: boolean;
  /** The anchor card's target; survives 3D ↔ panorama. */
  editingPanoramaId: number | null;
};

export const INITIAL_VIEWER_MODE: ViewerModeState = {
  mode: "orbit",
  selectedId: null,
  gizmo: "translate",
  snap: false,
  view: { kind: "scene" },
  move: false,
  editingPanoramaId: null,
};

export type ViewerModeAction =
  | { type: "toggleMeasure" }
  | { type: "exitMeasure" }
  | { type: "setGizmo"; gizmo: GizmoMode }
  | { type: "toggleSnap" }
  | { type: "select"; id: number | null }
  | { type: "enterPlace" }
  | { type: "exitPlace" }
  | { type: "enterPanorama"; id: number }
  | { type: "exitPanorama" }
  | { type: "toggleMove" }
  | { type: "exitMove" }
  | { type: "startEdit"; id: number }
  | { type: "closeEdit" }
  /** chainOpen: the measure tool still has a chain to break — that press is its, not ours. */
  | { type: "escape"; chainOpen: boolean };

const SCENE: ViewerView = { kind: "scene" };

/**
 * The scene's mutually exclusive interaction modes and the selection. Pure,
 * so every key and click is one table row: entering measure drops the gizmo
 * target (a stray drag must not move a placement), selecting leaves measure
 * and place, and Escape peels one layer at a time.
 *
 * `view` is a second axis, orthogonal to `mode`: the scene or one panorama.
 * `move` is a scene-only sub-mode for dragging panorama points, entering it
 * leaves measure and any selection the same way place does; place and move
 * cannot be entered from inside a panorama. `editingPanoramaId` is the
 * anchor card's own target and outlives a view switch. Escape now peels four
 * layers: move, then the selection, then the mode, then the panorama.
 */
export function viewerModeReducer(state: ViewerModeState, action: ViewerModeAction): ViewerModeState {
  switch (action.type) {
    case "toggleMeasure":
      return state.mode === "measure"
        ? { ...state, mode: "orbit" }
        : { ...state, mode: "measure", selectedId: null, move: false };
    case "exitMeasure":
      return state.mode === "measure" ? { ...state, mode: "orbit" } : state;
    case "setGizmo":
      return { ...state, gizmo: action.gizmo };
    case "toggleSnap":
      return { ...state, snap: !state.snap };
    case "select":
      return action.id === null
        ? { ...state, selectedId: null }
        : { ...state, mode: "orbit", selectedId: action.id, move: false };
    case "enterPlace":
      // B-5: inside a panorama nothing is placed — the tile is inert and the key is too.
      if (state.view.kind === "panorama") return state;
      return { ...state, mode: "place", selectedId: null, move: false };
    case "exitPlace":
      return state.mode === "place" ? { ...state, mode: "orbit" } : state;
    case "enterPanorama":
      return { ...state, mode: "orbit", move: false, view: { kind: "panorama", id: action.id } };
    case "exitPanorama":
      return state.view.kind === "scene" ? state : { ...state, view: SCENE };
    case "toggleMove":
      if (state.view.kind === "panorama") return state;
      return state.move
        ? { ...state, move: false }
        : { ...state, move: true, mode: "orbit", selectedId: null };
    case "exitMove":
      return state.move ? { ...state, move: false } : state;
    case "startEdit":
      // Editing a capture while standing inside a *different* one is
      // incoherent: the rig stands the eye on the edited anchor while the
      // sphere still wears the photograph of the one being stood in, and an
      // alignment judged against the wrong picture is saved to the edited row.
      // The pencil therefore walks the reader out first.
      return {
        ...state,
        editingPanoramaId: action.id,
        view: state.view.kind === "panorama" && state.view.id !== action.id ? SCENE : state.view,
      };
    case "closeEdit":
      return state.editingPanoramaId === null ? state : { ...state, editingPanoramaId: null };
    case "escape":
      if (action.chainOpen) return state;
      if (state.move) return { ...state, move: false };
      if (state.selectedId !== null) return { ...state, selectedId: null };
      if (state.mode !== "orbit") return { ...state, mode: "orbit" };
      if (state.view.kind === "panorama") return { ...state, view: SCENE };
      return state;
  }
}
