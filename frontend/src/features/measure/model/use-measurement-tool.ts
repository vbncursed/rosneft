import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  initialMeasurementState,
  measurementReducer,
  type Chain,
  type MeasurementAction,
  type MeasurementState,
  type MeasurePoint,
  type StoredChain,
} from "@/entities/measurement";

export type MeasurementDispatch = (action: MeasurementAction) => void;

/**
 * The tool's own hands, for a listener that acts later: `dispatch` is reported
 * in turn, and `read` answers the state as it is now, not as it was.
 */
export type MeasurementIO = { dispatch: MeasurementDispatch; read: () => MeasurementState };

/** Told about every transition, after React has been handed it. */
export type MeasurementTransition = (
  action: MeasurementAction,
  before: MeasurementState,
  after: MeasurementState,
  io: MeasurementIO,
) => void;

// useMeasurementTool wraps the measurement reducer with stable
// dispatching handlers. Every action is an atomic, pure reducer
// transition — no nested setState, so React.StrictMode's dev
// double-invoke can't duplicate points or burn ids.
//
// Click semantics in measure mode:
//   - No active chain → start a new chain at the click point.
//   - Active chain, click is near the chain's first point → close the
//     chain into a loop (≥3 points required); active chain ends.
//   - Active chain, click anywhere else → append a point, extending
//     the polyline.
//
// `onTransition` is called from the dispatcher, never from the reducer or an
// updater — StrictMode runs those twice, and a listener that sends requests
// would send each one twice. `before` is the tool's own running copy, so two
// dispatches in one event each see the other's result.
export function useMeasurementTool(onTransition?: MeasurementTransition) {
  const [state, react] = useReducer(measurementReducer, initialMeasurementState);
  const current = useRef(state);
  const listener = useRef(onTransition);
  useEffect(() => {
    listener.current = onTransition;
  });
  // Created once: every dispatcher below closes over it, and a new identity
  // would re-render the memoized three.js children on every state change.
  const [dispatch] = useState<MeasurementDispatch>(() => {
    const io: MeasurementIO = {
      dispatch: (action) => {
        const before = current.current;
        const after = measurementReducer(before, action);
        current.current = after;
        react(action);
        listener.current?.(action, before, after, io);
      },
      read: () => current.current,
    };
    return io.dispatch;
  });

  const click = useCallback((point: MeasurePoint) => dispatch({ type: "click", point }), [dispatch]);
  const closeActive = useCallback(() => dispatch({ type: "closeActive" }), [dispatch]);
  const cancelChain = useCallback(() => dispatch({ type: "cancelChain" }), [dispatch]);
  const toggle = useCallback(() => dispatch({ type: "toggle" }), [dispatch]);
  const exit = useCallback(() => dispatch({ type: "exit" }), [dispatch]);
  // keepSaved: leave the chains the server holds (a reader's Clear).
  const clear = useCallback(
    (keepSaved: boolean) => dispatch({ type: "clear", keepSaved }),
    [dispatch],
  );
  const removeChain = useCallback(
    (chainId: number) => dispatch({ type: "removeChain", chainId }),
    [dispatch],
  );
  const removeSegment = useCallback(
    (chainId: number, segmentIndex: number) =>
      dispatch({ type: "removeSegment", chainId, segmentIndex }),
    [dispatch],
  );

  // Where a chain stands with the server. The caller that talks to the
  // gateway reports through these; the hook itself sends nothing.
  const seed = useCallback(
    (chains: StoredChain[]) => dispatch({ type: "seed", chains }),
    [dispatch],
  );
  const saving = useCallback((id: number) => dispatch({ type: "saving", id }), [dispatch]);
  const saved = useCallback(
    (id: number, serverId: number) => dispatch({ type: "saved", id, serverId }),
    [dispatch],
  );
  const failed = useCallback((id: number) => dispatch({ type: "failed", id }), [dispatch]);
  const restore = useCallback((chain: Chain) => dispatch({ type: "restore", chain }), [dispatch]);

  // Active chain's start vertex — exposed for the interactive close
  // marker. Recompute only when the active chain or its points change.
  const activeChainStart = useMemo<MeasurePoint | null>(() => {
    if (state.activeChainId == null) return null;
    const chain = state.chains.find((c) => c.id === state.activeChainId);
    if (!chain || chain.points.length < 2) return null;
    return chain.points[0];
  }, [state.activeChainId, state.chains]);

  return {
    measureMode: state.measureMode,
    chains: state.chains,
    activeChainId: state.activeChainId,
    activeChainStart,
    click,
    closeActive,
    cancelChain,
    toggle,
    exit,
    clear,
    removeChain,
    removeSegment,
    seed,
    saving,
    saved,
    failed,
    restore,
  };
}
