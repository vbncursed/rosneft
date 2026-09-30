import { createContext, use } from "react";

/** How long the camera holds still before Auto reads the view again. */
export const SETTLE_MS = 250;

/** One object's read of the view: true once it measured, false when there was nothing to measure yet. */
export type Measure = () => boolean;

export type SettleBus = {
  /** Measure `m` after every settle; arms one now, so a newcomer on a still scene is read too. */
  watch: (m: Measure) => () => void;
  /** The camera moved: drop the retries, read everyone SETTLE_MS after it stops. */
  settle: () => void;
  /** A rendered frame: retry what had nothing to measure. */
  frame: () => void;
  stop: () => void;
};

/**
 * One timer and one retry list for every Auto LOD in the scene. Each watcher
 * is measured SETTLE_MS after the camera stops, never mid-gesture; one with
 * nothing to measure yet (a mesh still loading, hidden inside a panorama) is
 * retried on each rendered frame until it can be. Under frameloop="demand" R3F
 * draws a frame for exactly the changes that can make it measurable, so an
 * idle scene runs nothing.
 */
export function createSettleBus(): SettleBus {
  const watching = new Set<Measure>();
  const owed = new Set<Measure>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    for (const m of watching) if (!m()) owed.add(m);
  };
  const settle = () => {
    owed.clear();
    clearTimeout(timer);
    timer = setTimeout(run, SETTLE_MS);
  };
  return {
    watch(m) {
      watching.add(m);
      settle();
      return () => {
        watching.delete(m);
        owed.delete(m);
      };
    },
    settle,
    frame() {
      for (const m of owed) if (m()) owed.delete(m);
    },
    stop: () => clearTimeout(timer),
  };
}

export const AutoLodBus = createContext<SettleBus | null>(null);

export function useAutoLodBus(): SettleBus {
  const bus = use(AutoLodBus);
  if (!bus) throw new Error("useAutoLod needs an <AutoLodClock> above it");
  return bus;
}
