import { useCallback, useReducer } from "react";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { INITIAL_VIEWER_MODE, viewerModeReducer, type GizmoMode } from "./viewer-mode";

export type UseViewerModeParams = {
  /** placement:write — without it the gizmo keys do nothing. */
  canWrite: boolean;
  /** panorama:write — without it V does nothing. */
  canMovePoints: boolean;
  /** The measure tool has an unfinished chain; Escape breaks it before anything else. */
  chainOpen: boolean;
  onCancelChain: () => void;
  /** P: ask the owner of the panorama list to cycle to the next one. */
  onCycle: () => void;
  /** Runs before the reducer sees Escape; returning true claims the key. */
  beforeEscape?: () => boolean;
};

/** The reducer behind a stable API, with the viewer's keys bound. */
export function useViewerMode({
  canWrite,
  canMovePoints,
  chainOpen,
  onCancelChain,
  onCycle,
  beforeEscape,
}: UseViewerModeParams) {
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
  const enterPanorama = useCallback((id: number) => dispatch({ type: "enterPanorama", id }), []);
  const exitPanorama = useCallback(() => dispatch({ type: "exitPanorama" }), []);
  const toggleMove = useCallback(() => {
    leaveMeasure();
    dispatch({ type: "toggleMove" });
  }, [leaveMeasure]);
  const exitMove = useCallback(() => dispatch({ type: "exitMove" }), []);
  const startEdit = useCallback((id: number) => dispatch({ type: "startEdit", id }), []);
  const closeEdit = useCallback(() => dispatch({ type: "closeEdit" }), []);
  const escape = useCallback(() => {
    if (beforeEscape?.()) return;
    if (chainOpen) onCancelChain();
    dispatch({ type: "escape", chainOpen });
  }, [beforeEscape, chainOpen, onCancelChain]);

  const gizmoKey = (gizmo: GizmoMode) => () => {
    if (canWrite && state.selectedId !== null) setGizmo(gizmo);
  };

  useKeyboardShortcuts({
    m: toggleMeasure,
    t: gizmoKey("translate"),
    r: gizmoKey("rotate"),
    s: gizmoKey("scale"),
    g: toggleSnap,
    p: onCycle,
    v: () => {
      if (canMovePoints) toggleMove();
    },
    Escape: escape,
  });

  return {
    state,
    select,
    setGizmo,
    toggleSnap,
    toggleMeasure,
    exitMeasure,
    enterPlace,
    exitPlace,
    escape,
    enterPanorama,
    exitPanorama,
    toggleMove,
    exitMove,
    startEdit,
    closeEdit,
  };
}
