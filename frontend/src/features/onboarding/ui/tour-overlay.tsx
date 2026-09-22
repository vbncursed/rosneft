import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardStyle, dimStyle, HEIGHT, haloStyle, type Rect, scrollerOf, visibleRect } from "../model/tour-geometry";
import type { Tour } from "../model/use-tour";
import { TourTooltip } from "./tour-tooltip";

// Measured in a layout effect and kept up to date by the only two things that
// move a control the reader can cause: a window resize and a scroll, and, for
// a panel step, the reveal below. Capture phase, so a scroll inside the
// overlays panel counts and not just the document's own. No ResizeObserver and
// no rAF loop — the rail does not move by itself, and the halo is not worth a
// frame budget.
//
// `tracking`: the reader has moved the anchor since the step began. A scroll is
// not a state change — the spotlight follows it 1:1, and animates only between
// steps.
function useAnchorRect(selector: string, reveal: boolean): { rect: Rect | null; tracking: boolean } {
  const [anchor, setAnchor] = useState<{ rect: Rect | null; tracking: boolean }>({ rect: null, tracking: false });

  useLayoutEffect(() => {
    if (!selector) return;
    // A panel control can sit far below the panel's fold (ten panoramas push
    // the markers switch off-screen), and a control below the fold is not
    // under the pointer to be wheeled to. Scrolled before the first measure,
    // so the halo is drawn where the control ends up. "nearest": a visible
    // control does not move. "start" for a list taller than its panel: it is
    // never wholly visible, and "nearest" on one whose top the step before
    // scrolled past aligns its bottom, hiding the first rows it is there to
    // show. `?.` because jsdom has no scrollIntoView.
    const target = reveal ? document.querySelector(selector) : null;
    const tall = target && target.getBoundingClientRect().height > (scrollerOf(target)?.clientHeight ?? Infinity);
    target?.scrollIntoView?.({ block: tall ? "start" : "nearest" });
    let at: Rect | null = null;
    // `first` is the step's own measure: it resets `tracking` in the same
    // update as the new rect. After it, the reveal's own scroll event
    // re-measures the same box; a box that moved is the reader's doing.
    const measure = (first: boolean) => {
      const el = document.querySelector(selector);
      const now = el ? visibleRect(el) : null;
      if (first) at = now;
      const moved =
        !!now && !!at && (now.top !== at.top || now.left !== at.left || now.width !== at.width || now.height !== at.height);
      setAnchor((prev) => ({ rect: now, tracking: !first && (prev.tracking || moved) }));
    };
    const follow = () => measure(false);
    measure(true);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [selector, reveal]);

  // Derived, not cleared from the effect: a centred step must not inherit the
  // previous step's anchor, and the stale value never has to be written away.
  return { rect: selector ? anchor.rect : null, tracking: Boolean(selector) && anchor.tracking };
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
  const { rect, tracking } = useAnchorRect(selector, step?.tab !== undefined);
  // An inline style wins over the transition utility outright — no second
  // utility on the same property (see the clsx rule in frontend/CLAUDE.md).
  const follow: CSSProperties = tracking ? { transition: "none" } : {};
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

  // Chromium scrolls the dim under a wheel over its clip-path hole — element
  // hit-testing honours the hole, scroll targeting does not — so a lit list of
  // fifteen panoramas could not be scrolled. The event itself goes to the lit
  // control, not the dim, so it is caught on window: the native scroll is
  // cancelled and the anchor's scroller moved instead, the same in every
  // browser and never twice. `measure` follows the scroll and keeps the halo
  // on it. Not passive, or preventDefault is ignored.
  useEffect(() => {
    if (!rect) return;
    const onWheel = (event: WheelEvent) => {
      // A pinch-zoom (ctrlKey) or a sideways-only wheel is not a panel scroll.
      // `deltaMode` is deliberately not read: Firefox ≥88 reports pixels to a
      // listener that does not ask for it.
      if (event.ctrlKey || !event.deltaY) return;
      const { clientX: x, clientY: y } = event;
      if (x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return;
      const scroller = scrollerOf(document.querySelector(selector));
      if (!scroller) return;
      event.preventDefault();
      scroller.scrollBy({ top: event.deltaY, left: 0 });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [rect, selector]);

  if (!step) return null;

  return (
    <>
      {/* Swallows every click, so nothing behind it fires — a click beside
          the point is not "I have read this", Next is. A wheel over the hole
          is passed on to the lit control's scroller (see above). Fades in;
          between steps its hole travels to the next control. */}
      <div
        aria-hidden="true"
        data-testid="tour-dim"
        style={{ ...dimStyle(rect), ...follow }}
        className="fixed inset-0 z-[1200] bg-bg/60 transition-[opacity,clip-path] duration-[200ms,240ms] ease-out starting:opacity-0 motion-reduce:transition-opacity"
      />

      {rect && (
        <div
          data-testid="tour-halo"
          style={{ ...haloStyle(rect), ...follow }}
          // One fixed, childless box: tweening its layout box is cheap, and it
          // has to travel with the dim's hole.
          className="pointer-events-none fixed z-[1201] rounded-[8px] border border-accent shadow-[0_0_0_6px_var(--accent-soft)] transition-[top,left,width,height] duration-240 ease-out motion-reduce:transition-none"
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
