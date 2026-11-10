import { useState } from "react";
import type { Pt } from "@/entities/site-plan";
import { validFence } from "./fence";

type State = { source: string; page: number; points: Pt[]; drawing: boolean; closed: boolean; error: boolean };
export function useFence(source: string, page: number) {
  const empty = (): State => ({ source, page, points: [], drawing: false, closed: false, error: false });
  const [state, setState] = useState<State>(empty);
  const current = state.source === source && state.page === page ? state : empty();
  if (state !== current) setState(current);
  const update = (fn: (s: State) => State) => setState((s) => fn(s.source === source && s.page === page ? s : empty()));
  return {
    ...current,
    start: () => update(() => ({ ...empty(), drawing: true })),
    add: (point: Pt) => update((s) => (s.drawing ? { ...s, points: [...s.points, point], error: false } : s)),
    undo: () => update((s) => ({ ...s, points: s.points.slice(0, -1), error: false })),
    close: () => update((s) => (validFence(s.points) ? { ...s, drawing: false, closed: true } : { ...s, error: true })),
    clear: () => setState(empty()),
  };
}
