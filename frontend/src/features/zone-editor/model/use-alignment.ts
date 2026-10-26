import { useState } from "react";
import { deleteCalibration, putCalibration, type Calibration, type Document } from "@/entities/document";
import type { Vec3 } from "@/entities/placement";
import {
  autoPairs,
  drawingScale,
  fitSimilarity,
  scaleDifference,
  type CalibrationPair,
  type ControlPoint,
  type FitResult,
  type Pt,
} from "@/entities/site-plan";
import type { SourceBbox } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { scaleLine } from "./scale-line";

/** The content service takes 2 to 20 points. */
const MAX_PAIRS = 20;
const OFF_MODEL = "This plan's coordinates do not fall on this model";
const NO_PAIRS: CalibrationPair[] = [];
const NO_LABELS = "No survey labels on this page. Add point pairs by hand.";

export type AlignmentParams = {
  slug: string;
  document: Document;
  plan: { page: number; controls: ControlPoint[] | null };
  /** Null when the model's source box is unknown: automatic pairs are then off. */
  bbox: SourceBbox | null;
  /** Metres per scene unit. */
  unitRatio: number;
  groundAt: (x: number, z: number) => number | null;
  fallbackY: number;
  onChanged: () => void;
  /** The calibration as saved (or null once removed), so the page's copy of the document follows. */
  onCalibrated?: (calibration: Calibration | null) => void;
};

type Draft = { pairs: CalibrationPair[]; notice: string | null };

export type Alignment = ReturnType<typeof useAlignment>;

/** The point pairs tying one PDF page to the scene, the fit they give, and what to tell the reader about it. */
export function useAlignment(p: AlignmentParams) {
  const { slug, document, plan, bbox, unitRatio, onChanged, onCalibrated } = p;
  const { page } = plan;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [waiting, setWaiting] = useState<{ page: number; at: Pt } | null>(null);
  const [saving, setSaving] = useState(false);

  // Each page keeps its own pairs, so paging back loses nothing and a page never
  // inherits another's. A page's labels (or the saved set, if it is for this
  // page) seed its draft once they are read; a page still loading has none.
  if (plan.controls && !drafts[page]) {
    const saved = document.calibration?.page === page ? document.calibration.points : null;
    const auto = saved || !bbox ? [] : autoPairs(plan.controls, bbox, p.groundAt, p.fallbackY);
    const notice = saved || auto.length > 0 ? null : plan.controls.length ? OFF_MODEL : NO_LABELS;
    setDrafts((all) => ({ ...all, [page]: { pairs: (saved ?? auto).slice(0, MAX_PAIRS), notice } }));
  }
  const draft = drafts[page];
  const pairs = draft?.pairs ?? NO_PAIRS;
  const pending = waiting?.page === page ? waiting.at : null;
  const setPairs = (change: (all: CalibrationPair[]) => CalibrationPair[]) =>
    setDrafts((all) => ({
      ...all,
      [page]: { notice: all[page]?.notice ?? null, pairs: change(all[page]?.pairs ?? []) },
    }));
  const setPending = (at: Pt | null) => setWaiting(at && { page, at });
  const notice = draft?.notice ?? null;

  const fit: FitResult | null = pairs.length ? fitSimilarity(pairs.map((q) => ({ pdf: q.pdf, scene: q.scene }))) : null;
  const metresPerPt = drawingScale(pairs);
  const fitted = fit?.ok ? fit : null;
  const line = fitted && metresPerPt !== null ? scaleLine(scaleDifference(fitted.fit, unitRatio, metresPerPt)) : null;

  const addPlanPoint = (pdf: Pt) => {
    if (pairs.length < MAX_PAIRS) setPending(pdf);
  };
  const acceptScenePoint = (scene: Vec3) => {
    if (!pending) return;
    setPairs((all) => [...all, { pdf: pending, scene, utm: null }]);
    setPending(null);
  };

  async function save() {
    if (!fitted || saving) return;
    setSaving(true);
    try {
      const saved = await putCalibration(slug, document.id, { page: plan.page, points: pairs });
      notify.success("Alignment saved");
      onCalibrated?.(saved);
      onChanged();
    } catch (err) {
      notify.error(messageOf(err, "Could not save the alignment. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setPairs(() => []);
    setPending(null);
    if (!document.calibration) return;
    try {
      await deleteCalibration(slug, document.id);
      notify.success("Alignment removed");
      onCalibrated?.(null);
      onChanged();
    } catch (err) {
      notify.error(messageOf(err, "Could not remove the alignment. Try again."));
    }
  }

  return {
    pairs,
    pending,
    awaitingScenePick: pending !== null,
    notice: pairs.length === 0 ? notice : null,
    fit,
    residualsM: fitted ? fitted.residuals.map((r) => r * unitRatio) : [],
    fitLine: fitted?.exact && pairs.length === 2 ? "Exact fit with two points" : null,
    scaleLine: line?.text ?? null,
    scaleWarn: line?.warn ?? false,
    metresPerPt,
    error: fit && !fit.ok ? fit.message : null,
    canSave: fitted !== null && !saving,
    saving,
    addPlanPoint,
    cancelPending: () => setPending(null),
    acceptScenePoint,
    movePair: (i: number, pdf: Pt) => setPairs((all) => all.map((q, j) => (j === i ? { ...q, pdf } : q))),
    removePair: (i: number) => setPairs((all) => all.filter((_, j) => j !== i)),
    save,
    clear,
  };
}
