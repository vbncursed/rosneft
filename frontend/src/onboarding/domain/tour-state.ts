import type { TourStep } from "./tour-step";

// Pure tour state + transitions. Mirrors panorama/domain/marker-drag.ts: a
// state interface, an IDLE constant, and total functions between them. Nothing
// here touches the DOM — the caller decides whether a step's target exists and
// calls next() when it doesn't.
export interface TourState {
  steps: TourStep[];
  index: number;
  active: boolean;
}

export const IDLE: TourState = { steps: [], index: 0, active: false };

// An empty step list never activates, so the overlay never mounts.
export function start(steps: TourStep[]): TourState {
  return steps.length > 0 ? { steps, index: 0, active: true } : IDLE;
}

// Advancing past the last step finishes the tour.
export function next(state: TourState): TourState {
  if (!state.active) return state;
  if (state.index + 1 >= state.steps.length) return { ...state, active: false };
  return { ...state, index: state.index + 1 };
}

// Clamps at the first step rather than deactivating: Back should never end
// the tour.
export function prev(state: TourState): TourState {
  if (!state.active || state.index === 0) return state;
  return { ...state, index: state.index - 1 };
}

export function skip(state: TourState): TourState {
  return state.active ? { ...state, active: false } : state;
}

export function current(state: TourState): TourStep | null {
  return state.active ? (state.steps[state.index] ?? null) : null;
}
