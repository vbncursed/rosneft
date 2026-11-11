import { useLayoutEffect, useRef, useState } from "react";
import type { Calibration, Document } from "@/entities/document";
import type { Vec3 } from "@/entities/placement";
import { matchPlanLabels, zoneFromRect, type Pt } from "@/entities/site-plan";
import type { SourceBbox } from "@/entities/territory";
import { createZone, type Zone } from "@/entities/zone";
import { notify } from "@/shared/lib/notify";
import { rectInsideFence } from "./fence";
import { useFence } from "./use-fence";
import { manualRect, type ManualRect } from "./manual-rect";
import { planZones } from "./plan-zones";
import { useAlignment } from "./use-alignment";
import { usePlanDocument } from "./use-plan-document";
import type { ZoneForm } from "./use-zone-form";

export type ZoneEditorParams = {
  slug: string;
  document: Document;
  bbox: SourceBbox | null;
  /** Metres per scene unit. */
  unitRatio: number;
  groundAt: (x: number, z: number) => number | null;
  fallbackY: number;
  zones: Zone[];
  onChanged: () => void;
  /** The zone the gateway answered with, so the page's list can take it in. */
  onZoneCreated?: (zone: Zone) => void;
  onCalibrated?: (calibration: Calibration | null) => void;
};

/** Below this a zone has no inside (the same floor `zoneContains` uses), in scene units squared. */
const MIN_SCENE_AREA = 1e-9;
const NO_AREA = "This rectangle has no area.";

export type ZoneEditor = ReturnType<typeof useZoneEditor>;

/** One PDF page, its alignment to the scene, and the rectangle being turned into a zone. */
export function useZoneEditor(params: ZoneEditorParams) {
  const { slug, zones, groundAt, fallbackY, onChanged, onZoneCreated } = params;
  const plan = usePlanDocument(params.document);
  const fence = useFence(params.document.sourceBlobHash, plan.page);
  const alignment = useAlignment({ ...params, plan });
  const [draft, setDraft] = useState<{ source: string; page: number; value: ManualRect } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const manual = draft?.source === params.document.sourceBlobHash && draft.page === plan.page ? draft.value : null;
  const rects = manual ? [...plan.rects, manualRect(manual)] : plan.rects;
  const [selected, setSelected] = useState<number | null>(null);
  // null follows the fit: pairs are what an unaligned plan needs, rectangles what an aligned one does.
  const [wantPairs, setWantPairs] = useState<boolean | null>(null);
  const { fit, metresPerPt } = alignment;
  const rect = selected === null ? undefined : rects[selected];
  const sceneArea = rect && fit?.ok ? rect.widthPt * rect.heightPt * fit.fit.scale ** 2 : null;
  const current = useRef({ draft, selected, page: plan.page, source: params.document.sourceBlobHash });
  useLayoutEffect(() => {
    current.current = { draft, selected, page: plan.page, source: params.document.sourceBlobHash };
  }, [draft, selected, plan.page, params.document.sourceBlobHash]);
  const createBlock = sceneArea !== null && !(sceneArea >= MIN_SCENE_AREA) ? NO_AREA : null;

  async function createZoneFromSelection(form: ZoneForm, unchanged: () => boolean = () => true) {
    if (!rect || !fit?.ok || createBlock) return false;
    const body = zoneFromRect({ rect, fit: fit.fit, groundAt, fallbackY, metresPerPt });
    const created = await createZone(slug, { ...body, ...form });
    notify.success("Zone created");
    const sameDraft =
      current.current.draft === draft &&
      current.current.selected === selected &&
      current.current.page === plan.page &&
      current.current.source === params.document.sourceBlobHash &&
      unchanged();
    if (sameDraft) {
      setSelected(null);
      if (manual && selected === plan.rects.length) setDraft(null);
    }
    onZoneCreated?.(created);
    onChanged();
    return sameDraft;
  }

  return {
    fence,
    fenceWarning: rect && fence.closed ? !rectInsideFence(rect.corners, fence.points) : null,
    startFence: () => {
      setDrawing(false);
      setWantPairs(false);
      fence.start();
    },
    status: plan.status,
    annotationWarning: plan.annotationWarning,
    page: plan.page,
    pageCount: plan.pageCount,
    setPage: (page: number) => {
      fence.clear();
      setSelected(null);
      setDraft(null);
      setDrawing(false);
      plan.setPage(page);
    },
    layers: plan.layers,
    toggleLayer: (id: string) => {
      setSelected(null);
      plan.toggleLayer(id);
    },
    image: plan.image,
    pageSize: plan.pageSize,
    rects,
    manual,
    drawing,
    setDrawing: (value: boolean) => {
      setDrawing(value);
      if (value) {
        setWantPairs(false);
        if (fence.drawing) fence.clear();
      }
    },
    drawRect: (a: Pt, b: Pt) => {
      const width = Math.abs(a.x - b.x),
        height = Math.abs(a.y - b.y);
      if (width > 0 && height > 0) {
        setDraft({
          source: params.document.sourceBlobHash,
          page: plan.page,
          value: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width, height, angle: 0 },
        });
        setSelected(plan.rects.length);
      }
      setDrawing(false);
    },
    createManual: () => {
      if (!plan.pageSize) return;
      const { width, height } = plan.pageSize;
      setDraft({
        source: params.document.sourceBlobHash,
        page: plan.page,
        value: { x: width / 2, y: height / 2, width: width / 10, height: height / 10, angle: 0 },
      });
      setSelected(plan.rects.length);
      setDrawing(false);
      setWantPairs(false);
      if (fence.drawing) fence.clear();
    },
    editManual: (value: ManualRect) => {
      setDraft({ source: params.document.sourceBlobHash, page: plan.page, value });
      setSelected(plan.rects.length);
    },
    selected,
    suggestion:
      selected === null
        ? null
        : (() => {
            const match = matchPlanLabels(rects, plan.labels).find((m) => m.rectIndex === selected);
            return match
              ? { title: match.label.text.slice(0, 120), tagSlugs: match.tagSlugs, source: match.label.source }
              : null;
          })(),
    selectRect: (i: number) => setSelected((now) => (now === i ? null : i)),
    planZones: planZones(zones, fit?.ok ? fit.fit : null),
    alignment,
    pairs: alignment.pairs,
    fit,
    residualsM: alignment.residualsM,
    scaleLine: alignment.scaleLine,
    metresPerPt,
    awaitingScenePick: alignment.awaitingScenePick,
    acceptScenePoint: (scene: Vec3) => {
      alignment.acceptScenePoint(scene);
      setWantPairs(null);
    },
    /** A click on the sheet starts a pair (rectangles let it through) rather than picking a rectangle. */
    placing: wantPairs ?? !fit?.ok,
    setPlacing: (value: boolean) => {
      setDrawing(false);
      if (value && fence.drawing) fence.clear();
      setWantPairs(value);
    },
    createBlock,
    save: alignment.save,
    clear: alignment.clear,
    createZone: createZoneFromSelection,
  };
}
