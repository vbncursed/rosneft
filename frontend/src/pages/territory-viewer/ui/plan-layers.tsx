import { useEffect, useRef, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import type { Calibration, Document } from "@/entities/document";
import type { Vec3 } from "@/entities/placement";
import type { Similarity } from "@/entities/site-plan";
import type { SourceBbox } from "@/entities/territory";
import type { Zone } from "@/entities/zone";
import type { DocumentWindowProps } from "@/widgets/document-window";
import { AlignPanel, useZoneEditor, ZoneForm } from "@/features/zone-editor";
import { rectNames, SitePlanWindow } from "@/widgets/site-plan-window";
import type { Ground } from "@/widgets/viewer-canvas";
import { usePlanPreview } from "../model/use-plan-preview";
import type { PlanState } from "../model/use-plan-session";

export type PlanLayersProps = {
  slug: string;
  /** The PDF the editor is open on. */
  document: Document;
  bbox: SourceBbox | null;
  /** Metres per scene unit. */
  unitRatio: number;
  /** Null until the territory's mesh is in; the editor waits for it. */
  ground: Ground | null;
  zones: Zone[];
  /** The floating window's frame, shared with the document window. */
  pip: DocumentWindowProps["pip"];
  /** Where the align panel and the zone form go: the Overlays panel's zone slot. */
  slot: HTMLElement | null;
  /** Set while the editor waits for a click on the model, and null otherwise. */
  acceptRef: MutableRefObject<((scene: Vec3) => void) | null>;
  onPlan: (plan: PlanState | null) => void;
  onChanged: () => void;
  onZoneCreated: (zone: Zone) => void;
  onCalibrated: (calibration: Calibration | null) => void;
  onClose: () => void;
};

const A4_LANDSCAPE = { width: 842, height: 595 };

/** Tells the page the editor has drawn its picture and what it waits for; withdraws it on unmount. */
function usePublish(onPlan: PlanLayersProps["onPlan"], plan: PlanState | null) {
  const image = plan?.image;
  const waiting = plan?.awaitingScenePick ?? false;
  const preview = plan?.preview ?? null;
  useEffect(() => {
    onPlan(image ? { image, awaitingScenePick: waiting, preview } : null);
  }, [onPlan, image, waiting, preview]);
  useEffect(() => () => onPlan(null), [onPlan]);
}

function Editor({ onPlan, acceptRef, ...p }: Omit<PlanLayersProps, "ground"> & { ground: Ground }) {
  const { ground, document, pip, slot } = p;
  const editor = useZoneEditor({
    slug: p.slug,
    document,
    bbox: p.bbox,
    unitRatio: p.unitRatio,
    groundAt: ground.groundAt,
    fallbackY: ground.fallbackY,
    zones: p.zones,
    onChanged: p.onChanged,
    onZoneCreated: p.onZoneCreated,
    onCalibrated: p.onCalibrated,
  });
  const { alignment, fit, pageSize, image } = editor;
  const sim: Similarity | null = fit?.ok ? fit.fit : null;
  const rectName =
    editor.selected === null ? null : (rectNames(editor.rects, editor.metresPerPt)[editor.selected] ?? null);
  const preview = usePlanPreview({
    rects: editor.rects,
    similarity: sim,
    groundAt: ground.groundAt,
    fallbackY: ground.fallbackY,
    zones: p.zones,
    unitRatio: p.unitRatio,
    selected: editor.selected,
    label: rectName,
    selectRect: editor.selectRect,
  });
  usePublish(onPlan, image ? { image, awaitingScenePick: editor.awaitingScenePick, preview } : null);

  // A scene click reaches the editor through the page; the latest editor answers it.
  const latest = useRef(editor);
  useEffect(() => {
    latest.current = editor;
  });
  const waiting = editor.awaitingScenePick;
  useEffect(() => {
    acceptRef.current = waiting ? (scene) => latest.current.acceptScenePoint(scene) : null;
    return () => {
      acceptRef.current = null;
    };
  }, [waiting, acceptRef]);

  return (
    <>
      <SitePlanWindow
        image={image}
        pageSize={pageSize ?? A4_LANDSCAPE}
        rects={editor.rects}
        zones={editor.planZones}
        pairs={editor.pairs}
        pending={alignment.pending}
        selected={editor.selected}
        metresPerPt={editor.metresPerPt}
        placing={editor.placing}
        onSelectRect={editor.selectRect}
        onDragPair={alignment.movePair}
        onPlanClick={alignment.addPlanPoint}
        frame={{
          geometry: pip.geo,
          dragging: pip.dragging,
          onMoveStart: pip.startMove,
          onResizeStart: pip.startResize,
          actions: [{ name: "Close site plan", icon: "close", onClick: p.onClose }],
        }}
      />
      {slot
        ? createPortal(
            <div className="mb-3.5 flex flex-col gap-4 rounded-card border border-accent-line bg-panel-2 p-3">
              <AlignPanel editor={editor} />
              <ZoneForm
                rectName={rectName}
                canPlace={sim !== null && editor.selected !== null}
                blocked={editor.createBlock}
                onCreate={editor.createZone}
              />
            </div>,
            slot,
          )
        : null}
    </>
  );
}

/**
 * The plan editor, loaded on demand so pdf.js's reader stays out of the page's
 * own chunk. It draws no picture in the scene: the PDF lives in its window, and
 * the scene shows only the zones and the editor's candidate rectangles.
 */
export default function PlanLayers(props: PlanLayersProps) {
  return props.ground ? <Editor {...props} ground={props.ground} /> : null;
}
