import { useState } from "react";
import type { Calibration, Document } from "@/entities/document";
import type { Vec3 } from "@/entities/placement";
import { zoneFromRect } from "@/entities/site-plan";
import type { SourceBbox } from "@/entities/territory";
import { createZone, type Zone } from "@/entities/zone";
import { notify } from "@/shared/lib/notify";
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
  const alignment = useAlignment({ ...params, plan });
  const [selected, setSelected] = useState<number | null>(null);
  // null follows the fit: pairs are what an unaligned plan needs, rectangles what an aligned one does.
  const [wantPairs, setWantPairs] = useState<boolean | null>(null);
  const { fit, metresPerPt } = alignment;
  const rect = selected === null ? undefined : plan.rects[selected];
  const sceneArea = rect && fit?.ok ? rect.widthPt * rect.heightPt * fit.fit.scale ** 2 : null;
  const createBlock = sceneArea !== null && !(sceneArea >= MIN_SCENE_AREA) ? NO_AREA : null;

  async function createZoneFromSelection(form: ZoneForm) {
    if (!rect || !fit?.ok || createBlock) return;
    const body = zoneFromRect({ rect, fit: fit.fit, groundAt, fallbackY, metresPerPt });
    const created = await createZone(slug, { ...body, ...form });
    notify.success("Zone created");
    setSelected(null);
    onZoneCreated?.(created);
    onChanged();
  }

  return {
    status: plan.status,
    page: plan.page,
    pageCount: plan.pageCount,
    setPage: (page: number) => {
      setSelected(null);
      plan.setPage(page);
    },
    image: plan.image,
    pageSize: plan.pageSize,
    rects: plan.rects,
    selected,
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
    setPlacing: setWantPairs,
    createBlock,
    save: alignment.save,
    clear: alignment.clear,
    createZone: createZoneFromSelection,
  };
}
