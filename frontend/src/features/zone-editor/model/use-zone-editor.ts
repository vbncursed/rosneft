import { useState } from "react";
import type { Document } from "@/entities/document";
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
};

export type ZoneEditor = ReturnType<typeof useZoneEditor>;

/** One PDF page, its alignment to the scene, and the rectangle being turned into a zone. */
export function useZoneEditor(params: ZoneEditorParams) {
  const { slug, zones, groundAt, fallbackY, onChanged } = params;
  const plan = usePlanDocument(params.document);
  const alignment = useAlignment({ ...params, plan });
  const [selected, setSelected] = useState<number | null>(null);
  const { fit, metresPerPt } = alignment;

  async function createZoneFromSelection(form: ZoneForm) {
    const rect = selected === null ? undefined : plan.rects[selected];
    if (!rect || !fit?.ok) return;
    const body = zoneFromRect({ rect, fit: fit.fit, groundAt, fallbackY, metresPerPt });
    await createZone(slug, { ...body, ...form });
    notify.success("Zone created");
    setSelected(null);
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
    acceptScenePoint: (p: Vec3) => alignment.acceptScenePoint(p),
    save: alignment.save,
    clear: alignment.clear,
    createZone: createZoneFromSelection,
  };
}
