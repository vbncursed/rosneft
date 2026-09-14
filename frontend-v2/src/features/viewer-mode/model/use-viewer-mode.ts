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

  // Every way out of measure breaks an unfinished chain, not just Escape. A
  // lone marker used to survive M and Add objects: the next measure click
  // appended a segment from the stale point, and the first Escape back in orbit
  // was spent cancelling it with nothing visible happening. A chain can only be
  // opened in measure mode, so `chainOpen` alone says whether there is one.
  const leaveMeasure = useCallback(() => {
    if (chainOpen) onCancelChain();
  }, [chainOpen, onCancelChain]);

  const select = useCallback(
    (id: number | null) => {
      // Selecting an object leaves measure (the reducer says so); a deselect
      // stays where it is, and a click on empty space must not eat the chain.
      if (id !== null) leaveMeasure();
      dispatch({ type: "select", id });
    },
    [leaveMeasure],
  );
  const setGizmo = useCallback((gizmo: GizmoMode) => dispatch({ type: "setGizmo", gizmo }), []);
  const toggleSnap = useCallback(() => dispatch({ type: "toggleSnap" }), []);
  const toggleMeasure = useCallback(() => {
    leaveMeasure();
    dispatch({ type: "toggleMeasure" });
  }, [leaveMeasure]);
  const exitMeasure = useCallback(() => {
    leaveMeasure();
    dispatch({ type: "exitMeasure" });
  }, [leaveMeasure]);
  const enterPlace = useCallback(() => {
    leaveMeasure();
    dispatch({ type: "enterPlace" });
  }, [leaveMeasure]);
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
