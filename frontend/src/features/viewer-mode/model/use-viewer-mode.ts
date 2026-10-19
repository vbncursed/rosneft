import { useCallback, useReducer } from "react";
import { notify } from "@/shared/lib/notify";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { INITIAL_VIEWER_MODE, viewerModeReducer, type GizmoMode } from "./viewer-mode";

/** Said when G finds nothing under the camera to stand on. */
const NO_GROUND = "No ground under the camera to walk on. Fly over the territory and press G again.";

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
  /**
   * The document overlay's claim on Escape; returning true keeps the key.
   * Offered only when the reducer has nothing ahead of it to peel — see
   * `escape` below.
   */
  beforeEscape?: () => boolean;
  /** The territory has a scale (unitRatio ≠ 1): only then does G walk in the free cam. */
  canWalk?: boolean;
};

/** The reducer behind a stable API, with the viewer's keys bound. */
export function useViewerMode({
  canWrite,
  canMovePoints,
  chainOpen,
  onCancelChain,
  onCycle,
  beforeEscape,
  canWalk = false,
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
  // Entering from measure breaks an open chain, like every other way out of it.
  const toggleFree = useCallback(() => {
    leaveMeasure();
    dispatch({ type: "toggleFree" });
  }, [leaveMeasure]);
  const exitFree = useCallback(() => dispatch({ type: "exitFree" }), []);
  const toggleWalk = useCallback(() => dispatch({ type: "toggleWalk" }), []);
  // The canvas found nothing to stand on: keep flying, and say why.
  const refuseWalk = useCallback(() => {
    dispatch({ type: "exitWalk" });
    notify.info(NO_GROUND);
  }, []);
  const startEdit = useCallback((id: number) => dispatch({ type: "startEdit", id }), []);
  const closeEdit = useCallback(() => dispatch({ type: "closeEdit" }), []);
  // Spec §1's order: move, free, an open chain, the document overlay, then the
  // selection, the mode and the panorama. `beforeEscape` is the document's claim
  // on the key, so it is offered only once the reducer has nothing of its own
  // left to peel first — otherwise the window closed while the reader was still
  // stuck in a sub-mode Escape was pressed to leave.
  const escape = useCallback(() => {
    if (!state.move && !state.free && !chainOpen && beforeEscape?.()) return;
    if (chainOpen) onCancelChain();
    dispatch({ type: "escape", chainOpen });
  }, [beforeEscape, chainOpen, onCancelChain, state.move, state.free]);

  // S also flies backwards in the free cam; the panel's buttons still set the gizmo.
  const gizmoKey = (gizmo: GizmoMode) => () => {
    if (canWrite && state.selectedId !== null && !state.free) setGizmo(gizmo);
  };

  useKeyboardShortcuts({
    m: toggleMeasure,
    f: toggleFree,
    t: gizmoKey("translate"),
    r: gizmoKey("rotate"),
    s: gizmoKey("scale"),
    // G snaps the gizmo to the surface; in the free cam, which has no gizmo, it walks.
    g: () => {
      if (!state.free) toggleSnap();
      else if (canWalk) toggleWalk();
    },
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
    toggleFree,
    exitFree,
    refuseWalk,
    startEdit,
    closeEdit,
  };
}
