import { useCallback, useEffect, useRef, useState } from "react";
import type { Calibration, Document } from "@/entities/document";
import { notify } from "@/shared/lib/notify";
import type { PlanPreview } from "@/widgets/viewer-canvas";

/** What the plan editor tells the page: that its picture is drawn, what it waits for, and its candidate squares. */
export type PlanState = {
  image: ImageBitmap;
  awaitingScenePick: boolean;
  /** The editor's candidate squares on the ground; null until there is a fit. */
  preview: PlanPreview | null;
};

export type PlanSessionParams = {
  documents: Document[];
  /** `zone:write`: the editor opens for no one else. */
  canWrite: boolean;
};

const REMOVED = "The plan was removed.";

/**
 * The plan side of the viewer: which PDF the alignment editor is open on and
 * what the editor last published. The editor and its candidate squares close
 * together: whatever stops being there stops being drawn in the same render.
 */
export function usePlanSession({ documents, canWrite }: PlanSessionParams) {
  const [editingId, setEditingId] = useState<number | null>(null);
  // Whether the open document had an alignment when it opened, as far as the reader's own saves and clears know.
  const [aligned, setAligned] = useState(false);
  const [removals, setRemovals] = useState(0);
  const [plan, setPlan] = useState<PlanState | null>(null);
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

  return {
    editing,
    open: useCallback(
      (id: number) => {
        const doc = documents.find((d) => d.id === id);
        // Already open: the mounted editor will not publish again, so a reset would blank its candidates for good.
        if (!canWrite || !doc || id === editingId) return;
        setAligned(doc.calibration !== null);
        setPlan(null);
        setEditingId(id);
      },
      [documents, canWrite, editingId],
    ),
    close: useCallback(() => {
      setEditingId(null);
      setPlan(null);
    }, []),
    /** The reader saved or cleared the alignment themselves: not a removal to announce. */
    onCalibrated: useCallback((c: Calibration | null) => setAligned(c !== null), []),
    plan,
    onPlan: setPlan,
    preview: editing === null ? null : (plan?.preview ?? null),
    pickScene: editing !== null && (plan?.awaitingScenePick ?? false),
    acceptRef,
  };
}
