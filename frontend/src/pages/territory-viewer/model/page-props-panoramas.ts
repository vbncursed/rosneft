import type { ReactNode } from "react";
import { assetUrl } from "@/entities/content";
import { isCalibrated, isPanoramaShown } from "@/entities/panorama";
import type { ViewTabProps } from "@/widgets/view-tab";
import type { PageParts } from "./viewer-props";

/**
 * The View tab's Panoramas section, split out of `page-props-b.tsx` at the
 * 200-line cap. An editor (`panorama:write`) is listed every capture — a hidden
 * one dimmed, so it can be shown again; anyone else only what the map draws
 * (spec §3). `editor` is the anchor card, which `page-props-b.tsx` builds as JSX.
 */
export function panoramasTabProps(p: PageParts, editor: ReactNode): ViewTabProps["panoramas"] {
  const { panoramas: pan, grants, mode } = p;
  const inside = mode.view.kind === "panorama" ? mode.view.id : null;
  const canWrite = grants.panoramaWrite;
  const vis = pan.visibility;
  return {
    rows: pan.list
      .filter((panorama) => canWrite || isPanoramaShown(panorama, vis.phaseHidden))
      .map((panorama) => ({
        id: panorama.id,
        title: panorama.title,
        thumbUrl: panorama.thumbnailBlobHash ? assetUrl(panorama.thumbnailBlobHash) : null,
        active: panorama.id === inside,
        calibrated: isCalibrated(panorama),
        canEdit: canWrite,
        editing: panorama.id === mode.editingPanoramaId,
        phase: panorama.phase,
        hidden: panorama.hidden,
      })),
    justAddedId: pan.justAddedId,
    phases: {
      hidden: vis.phaseHidden,
      canWrite,
      pendingIds: vis.pendingIds,
      pendingPhases: vis.pendingPhases,
      onSetHidden: vis.onSetHidden,
      onMove: vis.onMove,
      onSetPhaseHidden: vis.onSetPhaseHidden,
    },
    calibrating: pan.calibration.active && pan.editing ? { title: pan.editing.title } : null,
    canUpload: grants.panoramaCreate,
    onUpload: pan.upload.onOpen,
    onEnter: pan.onEnter,
    onExit: pan.onExit,
    onEdit: pan.onEdit,
    markers: pan.markers,
    onMarkers: pan.onMarkers,
    onExitCalibration: pan.calibration.onExit,
    // Scene only (B-5): the reducer refuses V from inside a capture, and a
    // button offering a sub-mode that cannot be entered is worse than none.
    canMovePoints: canWrite && inside === null,
    moving: mode.move,
    onToggleMove: p.on.onToggleMove,
    link: {
      url: pan.link.url,
      // The tour URL is a field on the territory, so it is the territory's
      // own grant that opens it — not a panorama one.
      canEdit: grants.replace,
      saving: pan.link.saving,
      onSave: pan.link.onSave,
    },
    editor,
    fold: p.sections.panoramas,
  };
}
