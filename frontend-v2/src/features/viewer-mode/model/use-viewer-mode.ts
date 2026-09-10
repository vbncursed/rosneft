import { useCallback, useReducer } from "react";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { INITIAL_VIEWER_MODE, viewerModeReducer, type GizmoMode } from "./viewer-mode";

export type UseViewerModeParams = {
  /** placement:write — without it the gizmo keys do nothing. */
  canWrite: boolean;
  /** The measure tool has an unfinished chain; Escape breaks it before anything else. */
  chainOpen: boolean;
  onCancelChain: () => void;
};

/** The reducer behind a stable API, with the viewer's keys bound. */
export function useViewerMode({ canWrite, chainOpen, onCancelChain }: UseViewerModeParams) {
  const [state, dispatch] = useReducer(viewerModeReducer, INITIAL_VIEWER_MODE);

  const select = useCallback((id: number | null) => dispatch({ type: "select", id }), []);
  const setGizmo = useCallback((gizmo: GizmoMode) => dispatch({ type: "setGizmo", gizmo }), []);
  const toggleSnap = useCallback(() => dispatch({ type: "toggleSnap" }), []);
  const toggleMeasure = useCallback(() => dispatch({ type: "toggleMeasure" }), []);
  const exitMeasure = useCallback(() => dispatch({ type: "exitMeasure" }), []);
  const enterPlace = useCallback(() => dispatch({ type: "enterPlace" }), []);
  const exitPlace = useCallback(() => dispatch({ type: "exitPlace" }), []);
  const escape = useCallback(() => {
    if (chainOpen) onCancelChain();
    dispatch({ type: "escape", chainOpen });
  }, [chainOpen, onCancelChain]);

  const gizmoKey = (gizmo: GizmoMode) => () => {
    if (canWrite && state.selectedId !== null) setGizmo(gizmo);
  };

  useKeyboardShortcuts({
    m: toggleMeasure,
    t: gizmoKey("translate"),
    r: gizmoKey("rotate"),
    s: gizmoKey("scale"),
    g: toggleSnap,
    Escape: escape,
  });

  return { state, select, setGizmo, toggleSnap, toggleMeasure, exitMeasure, enterPlace, exitPlace, escape };
}
