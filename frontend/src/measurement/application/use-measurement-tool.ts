import { useCallback, useMemo, useReducer } from "react";
import {
  initialMeasurementState,
  measurementReducer,
} from "@/measurement/application/measurement-reducer";
import type { MeasurePoint } from "@/measurement/domain/measurement";

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
export function useMeasurementTool() {
  const [state, dispatch] = useReducer(measurementReducer, initialMeasurementState);

  const click = useCallback(
    (point: MeasurePoint) => dispatch({ type: "click", point }),
    [],
  );
  const closeActive = useCallback(() => dispatch({ type: "closeActive" }), []);
  const cancelChain = useCallback(() => dispatch({ type: "cancelChain" }), []);
  const toggle = useCallback(() => dispatch({ type: "toggle" }), []);
  const exit = useCallback(() => dispatch({ type: "exit" }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const removeChain = useCallback(
    (chainId: number) => dispatch({ type: "removeChain", chainId }),
    [],
  );
  const removeSegment = useCallback(
    (chainId: number, segmentIndex: number) =>
      dispatch({ type: "removeSegment", chainId, segmentIndex }),
    [],
  );

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
  };
}
