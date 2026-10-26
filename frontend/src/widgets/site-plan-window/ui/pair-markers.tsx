import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { Pt } from "@/entities/site-plan";

export type PairMarkersProps = {
  pairs: { pdf: Pt }[];
  /** The plan point waiting for its spot on the model. */
  pending: Pt | null;
  /** The view's zoom; markers are drawn at a constant on-screen size. */
  k: number;
  /** Client coordinates to page points. */
  toPage: (clientX: number, clientY: number) => Pt;
  onDrag: (index: number, to: Pt) => void;
};

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const MARKER =
  "absolute grid size-5 cursor-grab place-items-center rounded-full border-2 border-accent bg-panel font-mono text-[10px] text-fg [touch-action:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing";

const place = (at: Pt, k: number) => ({
  left: at.x,
  top: at.y,
  transform: `translate(-50%, -50%) scale(${1 / k})`,
});

/** Each pair's plan point, draggable onto its exact spot (a label sits a little off its marker). */
export function PairMarkers({ pairs, pending, k, toPage, onDrag }: PairMarkersProps) {
  const dragging = useRef<number | null>(null);
  const move = (i: number, e: PointerEvent) => {
    if (dragging.current === i) onDrag(i, toPage(e.clientX, e.clientY));
  };
  const nudge = (i: number, e: KeyboardEvent) => {
    const by = NUDGE[e.key];
    if (!by) return;
    e.preventDefault();
    onDrag(i, { x: pairs[i].pdf.x + by[0], y: pairs[i].pdf.y + by[1] });
  };
  return (
    <>
      {pairs.map((p, i) => (
        <button
          // oxlint-disable-next-line react/no-array-index-key -- a pair has no id; its position is its number, and the list only shrinks by removal
          key={i}
          type="button"
          aria-label={`Move plan point ${i + 1}`}
          style={place(p.pdf, k)}
          className={MARKER}
          onPointerDown={(e) => {
            dragging.current = i;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => move(i, e)}
          onPointerUp={() => (dragging.current = null)}
          onKeyDown={(e) => nudge(i, e)}
        >
          {i + 1}
        </button>
      ))}
      {pending ? (
        <span
          role="img"
          aria-label="Plan point waiting for its spot on the model"
          style={place(pending, k)}
          className="pointer-events-none absolute size-5 rounded-full border-2 border-dashed border-warn bg-warn-soft"
        />
      ) : null}
    </>
  );
}
