import { useCallback, useMemo, useState, type MutableRefObject } from "react";
import type { Calibration, Document } from "@/entities/document";
import type { ResolvedPlacement } from "@/entities/placement";
import type { SourceBbox } from "@/entities/territory";
import type { Zone } from "@/entities/zone";
import type { PlacementOrigin } from "@/features/placements-editor";
import { useZoneEquipment } from "@/features/zone-equipment";
import type { DocumentParts } from "./overlay-parts";
import type { MeasurePoint } from "@/entities/measurement";
import type { Ground, SiteProps } from "@/widgets/viewer-canvas";
import type { PlanLayersProps } from "../ui/plan-layers";
import { usePlanSession } from "./use-plan-session";
import { useZoneList } from "./use-zone-list";

export type ViewerZonesParams = {
  slug: string;
  /** The bundle's zones, seeded once. */
  initialZones: Zone[];
  bbox: SourceBbox | null;
  /** Metres per scene unit, as `computeUnitRatio` gives it. */
  unitRatio: number;
  documents: Pick<DocumentParts, "list" | "pip" | "onExit"> & {
    setCalibration: (id: number, calibration: Calibration | null) => void;
  };
  placements: ResolvedPlacement[];
  create: (modelSlug: string, count: number, groupId: number | null, origin: PlacementOrigin) => Promise<unknown>;
  /** `zone:write`. */
  canWrite: boolean;
  onChanged: () => void;
  /** The align panel and the zone card live in the Overlays panel, which must be open for them. */
  expandPanel: () => void;
};

export type ZoneParts = ReturnType<typeof useViewerZones>;

/**
 * The site-zones half of the viewer: the zone list and the one selected, the
 * aligned plan and the editor that makes it, and what the canvas is told of
 * both. The canvas gets one `site` object and one `pickScene` flag, memoised,
 * so a fold or a keystroke elsewhere on the page re-renders none of it.
 */
export function useViewerZones(p: ViewerZonesParams) {
  const { slug, documents, canWrite, onChanged, expandPanel } = p;
  const list = useZoneList({ slug, initial: p.initialZones, onChanged });
  const session = usePlanSession({ documents: documents.list, canWrite });
  const [ground, setGround] = useState<Ground | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const { editing, saved, onPlan, onCalibrated } = session;

  const equipment = useZoneEquipment({
    zone: list.selected,
    placements: p.placements,
    unitRatio: p.unitRatio,
    create: p.create,
  });

  const { open } = session;
  const { onExit } = documents;
  const onAlign = useCallback(
    (id: number) => {
      // The two windows do not stack: the PDF viewer makes way, and the panel opens for the align card.
      onExit();
      expandPanel();
      open(id);
    },
    [onExit, expandPanel, open],
  );

  const { setCalibration } = documents;
  const editingId = editing?.id ?? null;
  const calibrated = useCallback(
    (calibration: Calibration | null) => {
      onCalibrated(calibration);
      if (editingId !== null) setCalibration(editingId, calibration);
    },
    [onCalibrated, setCalibration, editingId],
  );

  const site = useMemo<SiteProps>(
    () => ({
      zones: list.zones,
      showZones: list.show,
      selectedZoneId: list.selected?.id ?? null,
      onSelectZone: list.select,
      plan: session.canvasPlan,
      planOpacity: session.opacity,
      onGround: setGround,
    }),
    [list.zones, list.show, list.selected?.id, list.select, session.canvasPlan, session.opacity],
  );

  const document: Document | null = editing ?? (session.showPlan ? session.saved : null);
  const layer: PlanLayersProps | null = document && {
    slug,
    document,
    editing: editing !== null,
    bbox: p.bbox,
    unitRatio: p.unitRatio,
    ground,
    zones: list.zones,
    pip: documents.pip,
    slot,
    acceptRef: session.acceptRef,
    onPlan,
    onChanged,
    onZoneCreated: list.add,
    onCalibrated: calibrated,
    onClose: session.close,
  };

  return {
    list: list.zones,
    selected: list.selected,
    onSelect: list.select,
    onDelete: list.remove,
    show: list.show,
    onToggleShow: list.toggleShow,
    site,
    pickScene: session.pickScene,
    acceptRef: session.acceptRef,
    equipment,
    plan: {
      available: saved !== null,
      show: session.showPlan,
      onToggle: session.toggleShowPlan,
      opacity: session.opacity,
      onOpacity: session.setOpacity,
    },
    editing,
    closeEditor: session.close,
    onAlign: canWrite ? onAlign : undefined,
    setSlot,
    layer,
  };
}

/**
 * What a click in the scene means to the page: picking a placement lets go of
 * the selected zone, and a point on the model goes to the alignment editor
 * while it is waiting for one (`accept` is set only then), to the ruler otherwise.
 */
export function useSceneClicks(
  accept: MutableRefObject<((point: MeasurePoint) => void) | null>,
  selectZone: (id: number | null) => void,
  onPick: (id: number | null) => void,
  onMeasurePoint: (point: MeasurePoint) => void,
) {
  return {
    onPick: useCallback(
      (id: number | null) => {
        if (id !== null) selectZone(null);
        onPick(id);
      },
      [selectZone, onPick],
    ),
    onMeasurePoint: useCallback(
      (point: MeasurePoint) => (accept.current ? accept.current(point) : onMeasurePoint(point)),
      [accept, onMeasurePoint],
    ),
  };
}
