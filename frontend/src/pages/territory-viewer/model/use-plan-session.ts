import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Calibration, Document } from "@/entities/document";
import type { Similarity } from "@/entities/site-plan";
import { notify } from "@/shared/lib/notify";
import { useStoredChoice } from "@/shared/lib/use-stored-choice";
import type { PlanLayer, PlanPreview } from "@/widgets/viewer-canvas";

/** What the plan layer tells the page: the picture, where the page lies on the ground, and what the editor waits for. */
export type PlanState = {
  image: ImageBitmap;
  page: { width: number; height: number };
  /** Null while the pairs do not give a fit. */
  similarity: Similarity | null;
  awaitingScenePick: boolean;
  /** The editor's candidate squares on the ground; null from the saved plan, which has none. */
  preview: PlanPreview | null;
};

export type PlanSessionParams = {
  documents: Document[];
  /** `zone:write`: the editor opens for no one else. */
  canWrite: boolean;
};

const PLAN_STORED = { off: null, on: "shown" } as const;
const DEFAULT_OPACITY = 0.6;
const REMOVED = "The plan was removed.";

/**
 * The plan side of the viewer: which PDF the alignment editor is open on, the
 * "Show plan" switch and its opacity, and the picture the plan layer last
 * published. The overlay and the editor close together: whatever stops being
 * there stops being drawn in the same render.
 */
export function usePlanSession({ documents, canWrite }: PlanSessionParams) {
  const [editingId, setEditingId] = useState<number | null>(null);
  // Whether the open document had an alignment when it opened, as far as the reader's own saves and clears know.
  const [aligned, setAligned] = useState(false);
  const [removals, setRemovals] = useState(0);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [choice, setChoice] = useStoredChoice("andrey.plan", PLAN_STORED);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const acceptRef = useRef<((scene: { x: number; y: number; z: number }) => void) | null>(null);

  const open = documents.find((d) => d.id === editingId);
  // An alignment someone else removed, or the document itself: nothing is left to edit or to draw.
  const gone = editingId !== null && (open === undefined || (aligned && open.calibration === null));
  // Reset while rendering, so the editor and its overlay are gone in this very commit; the toast waits for the effect.
  if (gone) {
    setEditingId(null);
    setPlan(null);
    setRemovals((n) => n + 1);
  }
  useEffect(() => {
    if (removals > 0) notify.info(REMOVED);
  }, [removals]);
  const editing = gone ? null : (open ?? null);

  const saved = documents.find((d) => d.calibration !== null) ?? null;
  // The picture belongs to one document page: another (or none) must not wear the old one with its own fit.
  // While editing, the editor republishes by itself, so only the saved plan is keyed.
  const savedKey = editing || !saved ? null : `${saved.id}:${saved.sourceBlobHash}:${saved.calibration?.page}`;
  const [seenKey, setSeenKey] = useState(savedKey);
  if (savedKey !== seenKey) {
    setSeenKey(savedKey);
    setPlan(null);
  }
  const showPlan = choice === "on";
  const drawn = editing !== null || (showPlan && saved !== null);

  const image = plan?.image;
  const [pageWidth, pageHeight] = [plan?.page.width, plan?.page.height];
  const sim = plan?.similarity;
  const [scale, rotation, tx, tz] = [sim?.scale, sim?.rotation, sim?.tx, sim?.tz];
  // The numbers, not the objects: the editor re-derives its fit every render.
  const canvasPlan = useMemo<PlanLayer | null>(
    () =>
      drawn &&
      image &&
      pageWidth !== undefined &&
      pageHeight !== undefined &&
      scale !== undefined &&
      rotation !== undefined &&
      tx !== undefined &&
      tz !== undefined
        ? { image, fit: { similarity: { scale, rotation, tx, tz }, page: { width: pageWidth, height: pageHeight } } }
        : null,
    [drawn, image, pageWidth, pageHeight, scale, rotation, tx, tz],
  );

  return {
    editing,
    saved,
    open: useCallback(
      (id: number) => {
        const doc = documents.find((d) => d.id === id);
        if (!canWrite || !doc) return;
        setAligned(doc.calibration !== null);
        setPlan(null);
        setEditingId(id);
      },
      [documents, canWrite],
    ),
    close: useCallback(() => {
      setEditingId(null);
      setPlan(null);
    }, []),
    /** The reader saved or cleared the alignment themselves: not a removal to announce. */
    onCalibrated: useCallback((c: Calibration | null) => setAligned(c !== null), []),
    plan,
    onPlan: setPlan,
    canvasPlan,
    preview: editing === null ? null : (plan?.preview ?? null),
    pickScene: editing !== null && (plan?.awaitingScenePick ?? false),
    acceptRef,
    showPlan,
    toggleShowPlan: useCallback(() => setChoice(showPlan ? "off" : "on"), [setChoice, showPlan]),
    opacity,
    setOpacity,
  };
}
