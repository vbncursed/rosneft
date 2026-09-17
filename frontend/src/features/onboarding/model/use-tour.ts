import { useCallback, useEffect, useRef, useState } from "react";
import { markTourSeen } from "../api/tours-gateway";
import { IDLE, current, next, prev, skip, start, type TourState } from "./tour-state";
import type { TourStep } from "./tour-step";

export interface Tour {
  active: boolean;
  step: TourStep | null;
  /** Zero-based, so the overlay prints `Step {stepIndex + 1} / {total}`. */
  stepIndex: number;
  total: number;
  isLast: boolean;
  next: () => void;
  prev: () => void;
  skip: () => void;
  restart: () => void;
}

// The principal is fetched once and is not refetched on client-side navigation,
// so a user who just finished a tour still looks unseen until a full reload.
// Remember it for the rest of the SPA session, otherwise leaving the page and
// coming back replays the tour.
const seenThisSession = new Set<string>();

// useTour owns one first-run tour: whether it runs, which step is showing, and
// marking it seen. It never touches the DOM — the overlay reports a missing
// target by calling next(), so the "skip steps whose control isn't rendered"
// rule needs no permission checks here.
//
// `ready` gates the start: the viewer tour is ready once the scene is up.
export function useTour(
  id: string,
  steps: TourStep[],
  { seen, ready }: { seen: boolean; ready: boolean },
): Tour {
  const alreadySeen = seen || seenThisSession.has(id);
  const [state, setState] = useState<TourState>(() => (ready && !alreadySeen ? start(steps) : IDLE));
  const wasActive = useRef(false);
  const persisted = useRef(alreadySeen);

  // Start when `ready` flips, adjusting state during render rather than from an
  // effect, so the first step and the UI that hosts it land in the same commit.
  // No "already started" guard is needed: finishing the tour adds it to
  // seenThisSession, which makes alreadySeen true on the very next render.
  const [prevReady, setPrevReady] = useState(ready);
  if (ready !== prevReady) {
    setPrevReady(ready);
    if (ready && !alreadySeen) setState(start(steps));
  }

  // One POST per tour, fired when a running tour stops — finishing and skipping
  // are the same thing to the server.
  useEffect(() => {
    if (state.active) {
      wasActive.current = true;
      return;
    }
    if (!wasActive.current || persisted.current) return;
    persisted.current = true;
    seenThisSession.add(id);
    // ponytail: swallow — worst case the tour replays on the next login.
    markTourSeen(id).catch(() => {});
  }, [state.active, id]);

  const goNext = useCallback(() => setState(next), []);
  const goPrev = useCallback(() => setState(prev), []);
  const goSkip = useCallback(() => setState(skip), []);
  const restart = useCallback(() => setState(start(steps)), [steps]);

  // Capture phase on document, so the tour sees the key before the viewer's own
  // window-level shortcuts. Every key is swallowed while the tour is up: M, T,
  // R, S and friends must not fire behind a modal overlay.
  //
  // Enter is deliberately not bound. Next is the tooltip's emphasised action,
  // so Enter already activates it once focused; intercepting the key here would
  // instead fire Next when the user has tabbed to Back or Skip.
  useEffect(() => {
    if (!state.active) return;
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") goSkip();
      else if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight") goNext();
      else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [state.active, goNext, goPrev, goSkip]);

  return {
    active: state.active,
    step: current(state),
    stepIndex: state.index,
    total: state.steps.length,
    isLast: state.active && state.index === state.steps.length - 1,
    next: goNext,
    prev: goPrev,
    skip: goSkip,
    restart,
  };
}
