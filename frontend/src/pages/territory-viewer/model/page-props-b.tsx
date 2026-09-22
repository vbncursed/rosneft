import { assetUrl } from "@/entities/content";
import { documentFileName } from "@/entities/document";
import { isCalibrated } from "@/entities/panorama";
import { instanceName, isVisibleIn, type PlacementGroup } from "@/entities/placement";
import type { UploadModalProps } from "@/widgets/upload-modal";
import { AnchorCard, insideFooter, LOADING_FOOTER, type ViewTabProps } from "@/widgets/view-tab";
import type { DocumentWindowProps } from "@/widgets/document-window";
import type { ViewerCanvasProps } from "@/widgets/viewer-canvas";
import { detailsOf } from "./page-props-selected";
import { DOC_EXPANDED_META, DOC_OPEN_META } from "./viewer-view";
import type { PageParts, PageViewState } from "./viewer-props";

/**
 * The package-B half of the page's props: the View tab, the panorama half of
 * the canvas, the document window and the one upload dialog both kinds share.
 *
 * It holds JSX — the anchor card is an element the page builds rather than a
 * bag of props the panel assembles — which is why this file is a `.tsx` and
 * why it is the only prop builder allowed to import a widget's component.
 */

/** The level on screen is not the level asked for, and the download is reporting. */
export function loadingLevel(view: PageViewState) {
  const { report, error } = view;
  if (error || report.shown === null || report.target === null) return null;
  if (report.shown === report.target || report.percent === null || report.progressText === null) {
    return null;
  }
  return {
    shown: report.shown,
    target: report.target,
    percent: report.percent,
    text: report.progressText,
  };
}

/** The viewport markers' names, by placement id — the panel's numbering, exactly. */
export const markerLabels = (groups: PlacementGroup[]): Record<number, string> =>
  Object.fromEntries(
    groups.flatMap((group) =>
      group.instances.map((instance) => [instance.id, instanceName(group, instance)]),
    ),
  );

/**
 * The Overlays panel's View tab: the scene's facts, every capture anchored in
 * it, the PDFs laid over it, and the anchor card when one is open.
 *
 * The footer answers whichever question the screen raises first — that both
 * overlays stay clickable while a level downloads, or, inside a capture, how
 * many placements the photo marks.
 */
export function viewTabProps(p: PageParts): ViewTabProps {
  const { panoramas: pan, documents: docs, grants, mode, measure } = p;
  const inside = mode.view.kind === "panorama" ? mode.view.id : null;

  return {
    details: detailsOf(p.slug, p.vm, inside !== null),
    panoramas: {
      rows: pan.list.map((panorama) => ({
        id: panorama.id,
        title: panorama.title,
        thumbUrl: assetUrl(panorama.sourceBlobHash),
        active: panorama.id === inside,
        calibrated: isCalibrated(panorama),
        canEdit: grants.panoramaWrite,
        editing: panorama.id === mode.editingPanoramaId,
      })),
      calibrating: pan.calibration.active && pan.editing ? { title: pan.editing.title } : null,
      canUpload: grants.panoramaCreate,
      onUpload: pan.upload.onOpen,
      onEnter: pan.onEnter,
      onExit: pan.onExit,
      onEdit: pan.onEdit,
      showMarkers: pan.showMarkers,
      onToggleMarkers: pan.onToggleMarkers,
      onExitCalibration: pan.calibration.onExit,
      // Scene only (B-5): the reducer refuses V from inside a capture, and a
      // button offering a sub-mode that cannot be entered is worse than none.
      canMovePoints: grants.panoramaWrite && inside === null,
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
      editor: anchorCard(p),
      fold: p.sections.panoramas,
    },
    documents: {
      rows: docs.list.map((document) => ({ id: document.id, name: documentFileName(document) })),
      canUpload: grants.documentWrite,
      onUpload: docs.upload.onOpen,
      onOpen: docs.onOpen,
      fold: p.sections.documents,
    },
    measurements: {
      saved: measure.chains.filter((c) => c.serverId != null).length,
      show: measure.show,
      onToggle: measure.onToggleShow,
    },
    footer:
      loadingLevel(p.view) !== null
        ? LOADING_FOOTER
        : inside === null
          ? null
          : insideFooter(p.placements.filter((x) => isVisibleIn(x, inside)).length),
  };
}

/** The card under the rows, for the one panorama being edited. */
function anchorCard(p: PageParts) {
  const { panoramas: pan, mode } = p;
  const editing = pan.editing;
  if (!editing) return null;
  const { calibration: cal } = pan;

  return (
    <AnchorCard
      panorama={editing}
      index={pan.index}
      inside={mode.view.kind === "panorama" && mode.view.id === editing.id}
      // A photo that never arrived cannot be aligned against the mesh.
      failed={pan.texture.status === "error"}
      cameraPositionRef={pan.cameraPositionRef}
      cameraYawRef={pan.cameraYawRef}
      saving={pan.pendingId === editing.id}
      canDelete={p.grants.panoramaDelete}
      onSave={pan.onSave}
      onDelete={pan.onDelete}
      onToggleView={pan.onToggleView}
      onCalibrate={cal.onStart}
      onClose={pan.onCloseEditor}
      calibration={
        cal.active && cal.draft
          ? {
              opacity: cal.opacity,
              onOpacity: cal.onOpacity,
              step: cal.step,
              onStep: cal.onStep,
              position: cal.draft.position,
              onNudge: cal.onNudge,
              yawOffset: cal.draft.yawOffset,
              onYaw: cal.onYaw,
              onSave: cal.onSave,
              onExit: cal.onExit,
            }
          : null
      }
    />
  );
}

/**
 * The panorama half of the canvas's props.
 *
 * The sphere renders the *draft* while one is open — that is what makes an
 * alignment live — and is ghosted only then: a reader looking around a capture
 * is looking at the photo, not through it.
 *
 * Which field carries the draft decides where the camera ends up. Inside a
 * capture it is `activePanorama`, so the sphere and the rig both follow the
 * nudge row. From the 3D view it is `calibrationGhost`, and `activePanorama`
 * stays null: the rig never mounts, the camera stays free, and the photo hangs
 * around the scene as a backdrop the anchor ring is dragged against.
 */
export function panoramaCanvasProps(p: PageParts, groups: PlacementGroup[]) {
  const { panoramas: pan } = p;
  const { effective } = pan.calibration;
  return {
    activePanorama: pan.active ? (effective ?? pan.active) : null,
    calibrationGhost: pan.active ? null : effective,
    panoramaBitmap: pan.texture.bitmap,
    panoramaStatus: pan.texture.status,
    panoramaProgress: pan.texture.progress,
    panoramaOpacity: pan.calibration.active ? pan.calibration.opacity : 1,
    calibrating: pan.calibration.active,
    panoramas: pan.list,
    showMarkers: pan.showMarkers,
    markerLabels: markerLabels(groups),
    move: { active: p.mode.move, draggingId: pan.drag.draggingId, livePos: pan.drag.livePos },
    cameraPositionRef: pan.cameraPositionRef,
    cameraYawRef: pan.cameraYawRef,
    onActivatePanorama: pan.onEnter,
    onMarkerGrab: pan.drag.begin,
    onMarkerMove: pan.drag.move,
    onMarkerDrop: pan.drag.end,
    // Every field the canvas asks for is spelled here; anything the widget
    // adds fails in `pageProps`, where the whole object is assembled.
  } satisfies Partial<ViewerCanvasProps>;
}

/**
 * The open document, in two pieces: the window itself and what the header says
 * about it. The window draws its own collapsed pill — the page only positions
 * it — so there is nothing here to build for the hidden state.
 *
 * The window is built for a collapsed document too — hiding it keeps the
 * reader's page and zoom, and unmounting it would throw both away.
 */
export function documentProps(p: PageParts): {
  window: DocumentWindowProps | null;
  meta: string | null;
} {
  const { documents: docs } = p;
  const active = docs.active;
  if (!active) return { window: null, meta: null };

  return {
    window: {
      document: active,
      window: docs.window,
      canDelete: p.grants.documentDelete,
      pip: docs.pip,
      onWindow: docs.onWindow,
      onDelete: docs.onDelete,
      onExit: docs.onExit,
    },
    meta: docs.window === "expanded" ? DOC_EXPANDED_META : DOC_OPEN_META,
  };
}

/** Whichever overlay upload is open — one dialog, two kinds, never both at once. */
export function uploadProps(p: PageParts): UploadModalProps | null {
  const { panoramas: pan, documents: docs } = p;
  if (pan.upload.open) {
    const form = pan.upload.form;
    return {
      ...common(p.title, form, pan.upload.onClose),
      kind: "panorama",
      gps: { checked: form.useGps, onChange: form.setUseGps },
    };
  }
  if (!docs.upload.open) return null;
  return { ...common(p.title, docs.upload.form, docs.upload.onClose), kind: "document" };
}

/** Everything the two dialogs share; only the kind and the GPS box differ. */
const common = (
  territoryTitle: string,
  form: PageParts["documents"]["upload"]["form"],
  onClose: () => void,
) => ({
  open: true,
  territoryTitle,
  upload: form.upload,
  title: form.title,
  onTitle: form.setTitle,
  canSubmit: form.canSubmit,
  onPick: form.pick,
  onClear: form.clear,
  onSubmit: form.submit,
  onCancelUpload: form.cancel,
  onClose,
});
