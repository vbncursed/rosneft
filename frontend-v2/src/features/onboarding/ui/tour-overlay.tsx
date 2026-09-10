import { type CSSProperties, useLayoutEffect, useState } from "react";
import type { Tour } from "../model/use-tour";
import { TourTooltip } from "./tour-tooltip";

const WIDTH = 320;
const GAP = 12;
// Budgeted, not measured: enough to decide whether the card fits below the
// anchor. Being wrong only picks the other side.
const HEIGHT = 190;
const HALO = 6;

type Rect = { top: number; left: number; width: number; height: number };

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

const CENTRED: CSSProperties = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

// Beside the anchor when the card fits to its right, below it when it does not,
// centred when neither works.
function cardStyle(rect: Rect | null): CSSProperties {
  if (!rect) return CENTRED;
  const beside = rect.left + rect.width + GAP;
  if (beside + WIDTH + GAP <= window.innerWidth) {
    return { top: clamp(rect.top, GAP, window.innerHeight - HEIGHT - GAP), left: beside };
  }
  const below = rect.top + rect.height + GAP;
  if (below + HEIGHT + GAP <= window.innerHeight) {
    return { top: below, left: clamp(rect.left, GAP, window.innerWidth - WIDTH - GAP) };
  }
  return CENTRED;
}

function haloStyle(rect: Rect): CSSProperties {
  return {
    top: rect.top - HALO,
    left: rect.left - HALO,
    width: rect.width + HALO * 2,
    height: rect.height + HALO * 2,
  };
}

// Measured in a layout effect and kept up to date by the only two things that
// move a control the reader can cause: a window resize and a scroll. Capture
// phase, so a scroll inside the overlays panel counts and not just the
// document's own. No ResizeObserver and no rAF loop — the rail does not move by
// itself, and the halo is not worth a frame budget.
function useAnchorRect(selector: string): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) return;
    const measure = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setRect(null);
        return;
      }
      const { top, left, width, height } = el.getBoundingClientRect();
      setRect({ top, left, width, height });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector]);

  // Derived, not cleared from the effect: a centred step must not inherit the
  // previous step's anchor, and the stale value never has to be written away.
  return selector ? rect : null;
}

// TourOverlay dims the page, lights one control up, and explains it beside the
// halo. A centred step has no anchor and no halo — it describes the screen.
//
// A missing anchor is reported to the parent as next(): a step whose control is
// not rendered (no permission, nothing selected) is skipped rather than
// spotlighting empty space.
export function TourOverlay({ tour }: { tour: Tour }) {
  const { step, stepIndex, total, next, prev, skip } = tour;
  const selector = step && !step.center ? `[data-tour="${step.id}"]` : "";
  const rect = useAnchorRect(selector);

  // Asked of the DOM here rather than read off `rect`: a null rect also means
  // "not measured yet", which would skip a step whose control is present.
  //
  // Nothing scrolls the anchor into view. Every A-scope anchor is fixed chrome
  // — the header link, the tool rail, the panel's own header — and scrolling
  // the page under a modal dim reads as a jump, not as help.
  useLayoutEffect(() => {
    if (selector && !document.querySelector(selector)) next();
  }, [selector, next]);

  if (!step) return null;

  return (
    <>
      {/* Swallows every click, so the control being explained cannot fire. It
          advances instead, and is hidden from assistive tech because Next says
          the same thing with a name. */}
      <div
        aria-hidden="true"
        data-testid="tour-dim"
        onClick={next}
        className="fixed inset-0 z-[1200] bg-bg/60"
      />

      {rect && (
        <div
          data-testid="tour-halo"
          style={haloStyle(rect)}
          className="pointer-events-none fixed z-[1201] rounded-[8px] border border-accent shadow-[0_0_0_6px_var(--accent-soft)]"
        />
      )}

      <div data-testid="tour-card" style={cardStyle(rect)} className="fixed z-[1210] w-[320px]">
        <TourTooltip
          step={stepIndex + 1}
          total={total}
          title={step.title}
          body={step.body}
          onNext={next}
          onBack={prev}
          onSkip={skip}
        />
      </div>
    </>
  );
}
