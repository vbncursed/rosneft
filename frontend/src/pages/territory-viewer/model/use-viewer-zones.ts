import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { Calibration, Document } from "@/entities/document";
import type { ResolvedPlacement } from "@/entities/placement";
import type { SourceBbox } from "@/entities/territory";
import type { Zone } from "@/entities/zone";
import type { PlacementOrigin } from "@/features/placements-editor";
import { useZoneEquipment } from "@/features/zone-equipment";
import type { DocumentParts } from "./overlay-parts";
import type { PageHandlers } from "./viewer-props";
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
    /** The editor is open and the plan layer has drawn its picture: its anchors exist. */
    editorReady: editing !== null && session.plan !== null,
    closeEditor: session.close,
    onAlign: canWrite ? onAlign : undefined,
    setSlot,
    layer,
  };
}

/**
 * What the keyboard and a click in the scene mean to the zones.
 *
 * A click on empty space or on a placement lets go of the selected zone; a
 * point on the model goes to the alignment editor while it is waiting for one
 * (`acceptRef` is set only then), to the ruler otherwise. Escape lets go of
 * the zone before anything else claims it (an open document, the mode).
 */
export function useZoneInput(
  zones: Pick<ZoneParts, "acceptRef" | "onSelect" | "selected">,
  on: PageHandlers,
  beforeEscape: MutableRefObject<() => boolean>,
  documentsEscape: () => boolean,
): PageHandlers {
  const { acceptRef, onSelect, selected } = zones;
  const { onPick, onMeasurePoint } = on;
  useEffect(() => {
    // oxlint-disable-next-line react/immutability -- the page's own handoff ref, written here because the zones hook is created after the mode reducer that reads it
    beforeEscape.current = () => {
      if (selected === null) return documentsEscape();
      onSelect(null);
      return true;
    };
  }, [beforeEscape, documentsEscape, onSelect, selected]);
  return {
    ...on,
    onPick: useCallback(
      (id: number | null) => {
        onSelect(null);
        onPick(id);
      },
      [onSelect, onPick],
    ),
    onMeasurePoint: useCallback(
      (point: MeasurePoint) => (acceptRef.current ? acceptRef.current(point) : onMeasurePoint(point)),
      [acceptRef, onMeasurePoint],
    ),
  };
}
