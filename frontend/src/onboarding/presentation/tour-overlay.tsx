"use client";

import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react";
import type { Tour } from "@/onboarding/application/use-tour";
import {
  useAnchoredPosition,
  type AnchorRect,
} from "@/shared/presentation/components/dropdown/use-anchored-position";

interface TourOverlayProps {
  tour: Tour;
}

const WIDTH = 320;
const GAP = 12;
// Budgeted, not measured: enough to decide whether the card fits below the
// anchor. Being wrong only picks the other side.
const HEIGHT = 190;
const HALO = 6;

function haloStyle(rect: AnchorRect): CSSProperties {
  return {
    position: "fixed",
    top: rect.top - HALO,
    left: rect.left - HALO,
    width: rect.width + HALO * 2,
    height: rect.height + HALO * 2,
  };
}

function cardStyle(rect: AnchorRect | null): CSSProperties {
  if (!rect) {
    return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: WIDTH };
  }
  const below = rect.top + rect.height + GAP;
  const flip = below + HEIGHT > window.innerHeight;
  return {
    position: "fixed",
    top: flip ? Math.max(GAP, rect.top - GAP - HEIGHT) : below,
    left: Math.min(Math.max(GAP, rect.left), window.innerWidth - WIDTH - GAP),
    width: WIDTH,
  };
}

// TourOverlay spotlights one control and explains it. The dimmed backdrop is
// the halo's own 9999px box-shadow — the hole in it is the control itself, so
// there is no mask, no clip-path, and nothing to keep in sync with the rect.
//
// A missing anchor is reported to the parent as onNext(): a step whose control
// isn't rendered (no permission, no panoramas, nothing selected) is skipped.
export default function TourOverlay({ tour }: TourOverlayProps) {
  const { step, isLast, next: onNext, prev: onPrev, skip: onSkip } = tour;
  const selector = step && !step.center ? `[data-tour="${step.id}"]` : "";
  const anchored = selector !== "";
  const measured = useAnchoredPosition(selector, anchored);
  const nextRef = useRef<HTMLButtonElement>(null);

  // While disabled the hook keeps its last rect; a centred step must not
  // inherit the previous step's anchor.
  const rect = anchored ? measured : null;

  // Ask the DOM directly, in a layout effect, rather than reading the hook's
  // rect: a null rect also means "not measured yet", and React can flush this
  // commit's passive effects before the hook's own layout effect has re-run —
  // which would skip a step whose control is perfectly present.
  useLayoutEffect(() => {
    if (anchored && !document.querySelector(selector)) onNext();
  }, [selector, anchored, onNext]);

  // Anchored but unmeasured: hold the dim backdrop for this commit rather than
  // flashing the card at the previous step's position.
  const ready = !anchored || rect !== null;

  useEffect(() => {
    if (step && ready) nextRef.current?.focus();
  }, [step, ready]);

  if (!step) return null;

  return (
    <>
      {/* Swallows every click so the control being explained can't fire. */}
      <div className="fixed inset-0 z-[1200]" onClick={onNext} />

      {!ready ? null : (
        <>
          {rect ? (
            <div
              style={haloStyle(rect)}
              className="pointer-events-none z-[1201] rounded-xl ring-2 ring-cyan-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] motion-safe:transition-all motion-safe:duration-200"
            />
          ) : (
            <div className="pointer-events-none fixed inset-0 z-[1201] bg-black/65" />
          )}

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`tour-title-${step.id}`}
            style={cardStyle(rect)}
            className="pointer-events-auto z-[1210] rounded-2xl border border-white/15 bg-black/85 p-4 text-neutral-100 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md"
          >
            <h2 id={`tour-title-${step.id}`} className="text-sm font-medium text-white">
              {step.title}
            </h2>
            <p aria-live="polite" className="mt-2 text-[12px] leading-relaxed text-neutral-300">
              {step.body}
            </p>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onSkip}
                className="cursor-pointer rounded-md px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                Skip
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPrev}
                  className="cursor-pointer rounded-md border border-white/15 px-3 py-1.5 text-[11px] text-neutral-200 transition-colors hover:border-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  Back
                </button>
                <button
                  ref={nextRef}
                  type="button"
                  onClick={onNext}
                  className="cursor-pointer rounded-md border border-cyan-300/60 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-medium text-cyan-100 transition-colors hover:bg-cyan-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  {isLast ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
