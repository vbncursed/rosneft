import {
  appendPoint,
  type Chain,
  closeChain as closeChainOp,
  removeSegment as removeSegmentOp,
  shouldCloseAt,
} from "./chain";
import type { MeasurePoint } from "./measurement";

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
  // keepSaved: only the chains the server does not hold go (a reader's Clear).
  | { type: "clear"; keepSaved: boolean }
  | { type: "removeChain"; chainId: number }
  | { type: "removeSegment"; chainId: number; segmentIndex: number }
  | { type: "seed"; chains: StoredChain[] }
  | { type: "saving"; id: number }
  | { type: "saved"; id: number; serverId: number }
  | { type: "failed"; id: number }
  | { type: "restore"; chain: Chain };

// StoredChain is a chain as the server holds it, before it has a local id.
export type StoredChain = Pick<Chain, "points" | "closed"> & { serverId: number };

// finish ends the active chain. A chain that ends with fewer than two points
// has no segment to show or save, so it goes with it.
function finish(
  state: MeasurementState,
  chains: Chain[] = state.chains,
): Pick<MeasurementState, "chains" | "activeChainId"> {
  const activeId = state.activeChainId;
  return {
    chains: chains.filter((c) => c.id !== activeId || c.points.length >= 2),
    activeChainId: null,
  };
}

function patchChain(
  state: MeasurementState,
  id: number,
  patch: Partial<Chain>,
): MeasurementState {
  if (!state.chains.some((c) => c.id === id)) return state;
  return {
    ...state,
    chains: state.chains.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

// seed replaces the saved chains with the server's. Local chains stay, and so
// does a saved chain whose last write failed: its edit is not on the server
// yet, so it wins over the server's copy of the same row.
function seed(state: MeasurementState, stored: StoredChain[]): MeasurementState {
  const kept = state.chains.filter((c) => c.serverId == null || c.sync === "failed");
  const held = new Set(kept.map((c) => c.serverId));
  const chains = stored
    .filter((c) => !held.has(c.serverId))
    .map((c, i): Chain => ({ ...c, id: state.nextId + i, sync: "saved" }));
  return {
    ...state,
    chains: [...kept, ...chains],
    nextId: state.nextId + chains.length,
  };
}

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
          chains: [...state.chains, { id, points: [action.point], closed: false, sync: "local" }],
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
      const chains = state.chains.map((c) => (c.id === activeId ? closeChainOp(c) : c));
      return { ...state, ...finish(state, chains) };
    }

    case "cancelChain":
      return state.activeChainId == null ? state : { ...state, ...finish(state) };

    case "toggle":
      return state.measureMode
        ? { ...state, measureMode: false, ...finish(state) }
        : { ...state, measureMode: true };

    case "exit":
      return { ...state, measureMode: false, ...finish(state) };

    case "clear":
      return {
        ...state,
        chains: action.keepSaved ? state.chains.filter((c) => c.serverId != null) : [],
        activeChainId: null,
      };

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
      const chains = state.chains.flatMap((c) =>
        c.id === action.chainId ? replacements : [c],
      );
      const ends = state.activeChainId === action.chainId ? finish(state, chains) : { chains };
      return {
        ...state,
        ...ends,
        // Both ids are retired even when removeSegment returns one chain: a
        // split that drops its left side still labels the survivor newIds[1],
        // so counting the returned chains would reissue an id still on screen.
        nextId: state.nextId + newIds.length,
      };
    }

    case "seed":
      return seed(state, action.chains);

    case "saving":
      return patchChain(state, action.id, { sync: "saving" });

    case "saved":
      return patchChain(state, action.id, { serverId: action.serverId, sync: "saved" });

    case "failed":
      return patchChain(state, action.id, { sync: "failed" });

    case "restore":
      return state.chains.some((c) => c.id === action.chain.id)
        ? state
        : { ...state, chains: [...state.chains, action.chain] };

    default:
      return state;
  }
}
