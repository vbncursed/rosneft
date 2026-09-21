import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Tour } from "../model/use-tour";
import { TourTooltip } from "./tour-tooltip";

// The card's own width lives on TourTooltip (`w-80`); this is the same number,
// needed here for the fit maths. The two must agree.
const WIDTH = 320;
const GAP = 12;
// The card is measured once it is up (a four-line body runs ~215px); this is
// only the first frame's guess, and what a layout-less test sees.
const HEIGHT = 190;
const HALO = 6;

type Rect = { top: number; left: number; width: number; height: number };

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

const CENTRED: CSSProperties = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

// Beside the anchor when the card fits to its right, below it when it does not,
// centred when neither works.
function cardStyle(rect: Rect | null, height: number): CSSProperties {
  if (!rect) return CENTRED;
  const beside = rect.left + rect.width + GAP;
  if (beside + WIDTH + GAP <= window.innerWidth) {
    return { top: clamp(rect.top, GAP, window.innerHeight - height - GAP), left: beside };
  }
  const below = rect.top + rect.height + GAP;
  if (below + height + GAP <= window.innerHeight) {
    return { top: below, left: clamp(rect.left, GAP, window.innerWidth - WIDTH - GAP) };
  }
  return CENTRED;
}

// The dim covers everything, and the mock redraws the anchored control *above*
// it — lit, not veiled at 60 %. An evenodd hole in the dim's own clip-path is
// the whole of that: no page element changes z-index (a control inside its own
// stacking context could not be raised above a fixed overlay anyway), and
// hit-testing follows the clip, so the lit control is what
// `document.elementFromPoint` answers at its centre. Losing the dim's click
// there is the point: the mock draws a live control, not a picture of one.
function dimStyle(rect: Rect | null): CSSProperties {
  if (!rect) return {};
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const hole = [
    `${rect.left}px ${rect.top}px`,
    `${rect.left}px ${bottom}px`,
    `${right}px ${bottom}px`,
    `${right}px ${rect.top}px`,
    `${rect.left}px ${rect.top}px`,
  ].join(", ");
  return {
    clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${hole})`,
  };
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
// move a control the reader can cause: a window resize and a scroll, and, for
// a panel step, the reveal below. Capture phase, so a scroll inside the
// overlays panel counts and not just the document's own. No ResizeObserver and
// no rAF loop — the rail does not move by itself, and the halo is not worth a
// frame budget.
function useAnchorRect(selector: string, reveal: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) return;
    // A panel control can sit far below the panel's fold (ten panoramas push
    // the markers switch off-screen), and the dim swallows the wheel that would
    // reach it. Scrolled before the first measure, so the halo is drawn where
    // the control ends up. `?.` because jsdom has no scrollIntoView.
    if (reveal) document.querySelector(selector)?.scrollIntoView?.({ block: "center" });
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
  }, [selector, reveal]);

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
  const rect = useAnchorRect(selector, step?.tab !== undefined);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(HEIGHT);

  // Each step's body is its own length. Measured before paint, so the card
  // never shows at the guessed place first; 0 means nothing was laid out.
  useLayoutEffect(() => {
    const measured = cardRef.current?.offsetHeight;
    if (measured) setHeight(measured);
  }, [step]);

  // Anchored but not yet measured: the card is still at the previous step's
  // place, so do not pull focus into it until it has landed.
  const ready = !selector || rect !== null;

  // Asked of the DOM here rather than read off `rect`: a null rect also means
  // "not measured yet", which would skip a step whose control is present.
  useLayoutEffect(() => {
    if (selector && !document.querySelector(selector)) next();
  }, [selector, next]);

  // Focus follows the step. The dim is not `inert` and the page under it keeps
  // its tab order, so without this the reader's focus is still on whatever the
  // tour is about to explain.
  useEffect(() => {
    if (step && ready) nextRef.current?.focus();
  }, [step, ready]);

  // ...and stays: Tab cycles the card's own enabled buttons — Skip tour, Back,
  // Next — instead of walking into the page behind the dim. Capture phase on
  // document for the same reason useTour uses it, and Escape and the arrows are
  // left to that hook.
  useEffect(() => {
    if (!step) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = [
        ...(cardRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []),
      ];
      if (buttons.length === 0) return;
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      // Focus outside the card enters it at whichever end the reader is heading
      // for, rather than jumping to the middle.
      const to =
        at === -1
          ? (event.shiftKey ? buttons.length - 1 : 0)
          : (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[to].focus();
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [step]);

  if (!step) return null;

  return (
    <>
      {/* Swallows every click, so nothing behind it fires — and does nothing
          else: a click beside the point is not "I have read this", Next is.
          Fades in; between steps its hole travels to the next control. */}
      <div
        aria-hidden="true"
        data-testid="tour-dim"
        style={dimStyle(rect)}
        className="fixed inset-0 z-[1200] bg-bg/60 transition-[opacity,clip-path] duration-[200ms,240ms] ease-[var(--ease-out),cubic-bezier(0.77,0,0.175,1)] starting:opacity-0 motion-reduce:transition-opacity"
      />

      {rect && (
        <div
          data-testid="tour-halo"
          style={haloStyle(rect)}
          // One fixed, childless box: tweening its layout box is cheap, and it
          // has to travel with the dim's hole.
          className="pointer-events-none fixed z-[1201] rounded-[8px] border border-accent shadow-[0_0_0_6px_var(--accent-soft)] transition-[top,left,width,height] duration-240 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
        />
      )}

      {/* Keyed by step: each step's card arrives on its own. */}
      <div
        key={step.id}
        ref={cardRef}
        data-testid="tour-card"
        style={cardStyle(rect, height)}
        className="fixed z-[1210] transition-[opacity,translate] duration-180 ease-out starting:opacity-0 motion-safe:starting:translate-y-1"
      >
        <TourTooltip
          nextRef={nextRef}
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
