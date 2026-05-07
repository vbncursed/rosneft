import {
  appendPoint,
  type Chain,
  closeChain as closeChainOp,
  removeSegment as removeSegmentOp,
  shouldCloseAt,
} from "@/measurement/domain/chain";
import type { MeasurePoint } from "@/measurement/domain/measurement";

// Single-state reducer for the measurement editor. Keeping every field
// in one state object behind useReducer means each user action is one
// atomic, pure transition — no nested setState calls (which React's
// StrictMode dev double-invoke can fire multiple times, duplicating
// points) and no read-after-stale closures.

export interface MeasurementState {
  measureMode: boolean;
  chains: Chain[];
  activeChainId: number | null;
  // Monotonic id counter lives in state so StrictMode double-invokes
  // can't burn ids — the reducer is pure, double-invoking it produces
  // the same next state, so the id space stays predictable.
  nextId: number;
}

export const initialMeasurementState: MeasurementState = {
  measureMode: false,
  chains: [],
  activeChainId: null,
  nextId: 1,
};

export type MeasurementAction =
  | { type: "click"; point: MeasurePoint }
  | { type: "closeActive" }
  | { type: "cancelChain" }
  | { type: "toggle" }
  | { type: "exit" }
  | { type: "clear" }
  | { type: "removeChain"; chainId: number }
  | { type: "removeSegment"; chainId: number; segmentIndex: number };

export function measurementReducer(
  state: MeasurementState,
  action: MeasurementAction,
): MeasurementState {
  switch (action.type) {
    case "click": {
      if (state.activeChainId == null) {
        const id = state.nextId;
        return {
          ...state,
          chains: [...state.chains, { id, points: [action.point], closed: false }],
          activeChainId: id,
          nextId: state.nextId + 1,
        };
      }
      const activeId = state.activeChainId;
      let closedNow = false;
      const chains = state.chains.map((c) => {
        if (c.id !== activeId) return c;
        if (shouldCloseAt(c, action.point)) {
          const closed = closeChainOp(c);
          // Defensive: only flip the activeChainId off if the chain
          // genuinely transitioned to closed. closeChainOp is a no-op
          // when the invariants don't hold, and treating that as a
          // close would silently drop the point.
          if (closed.closed) {
            closedNow = true;
            return closed;
          }
        }
        return appendPoint(c, action.point);
      });
      return {
        ...state,
        chains,
        activeChainId: closedNow ? null : activeId,
      };
    }

    case "closeActive": {
      if (state.activeChainId == null) return state;
      const activeId = state.activeChainId;
      return {
        ...state,
        chains: state.chains.map((c) =>
          c.id === activeId ? closeChainOp(c) : c,
        ),
        activeChainId: null,
      };
    }

    case "cancelChain":
      return state.activeChainId == null ? state : { ...state, activeChainId: null };

    case "toggle": {
      const next = !state.measureMode;
      return {
        ...state,
        measureMode: next,
        activeChainId: next ? state.activeChainId : null,
      };
    }

    case "exit":
      return { ...state, measureMode: false, activeChainId: null };

    case "clear":
      return { ...state, chains: [], activeChainId: null };

    case "removeChain": {
      const chains = state.chains.filter((c) => c.id !== action.chainId);
      return {
        ...state,
        chains,
        activeChainId:
          state.activeChainId === action.chainId ? null : state.activeChainId,
      };
    }

    case "removeSegment": {
      const target = state.chains.find((c) => c.id === action.chainId);
      if (!target) return state;
      const newIds: [number, number] = [state.nextId, state.nextId + 1];
      const replacements = removeSegmentOp(target, action.segmentIndex, newIds);
      const usedIds = replacements.length;
      const chains = state.chains.flatMap((c) =>
        c.id === action.chainId ? replacements : [c],
      );
      return {
        ...state,
        chains,
        activeChainId:
          state.activeChainId === action.chainId ? null : state.activeChainId,
        nextId: state.nextId + usedIds,
      };
    }

    default:
      return state;
  }
}
