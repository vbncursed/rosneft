import type { Document } from "@/entities/document";
import type { Panorama } from "@/entities/panorama";
import type { ResolvedPlacement } from "@/entities/placement";
import type { FileUploadState } from "@/entities/upload";
import { degToRad } from "@/widgets/view-tab";
import type { PageParts } from "./model/page-props";
import { NO_DELETE, page, selected } from "./territory-viewer-page.fixture";

/**
 * Mock states 8–13: the two overlays a territory carries. Everything is one
 * override of the same parts the package-A states use, so the two files draw
 * one page and never two.
 */

const panorama = (
  id: number,
  slug: string,
  title: string,
  position = { x: 0, y: 0, z: 0 },
  yawOffset = 0,
): Panorama => ({
  id,
  territorySlug: "refinery-block-c",
  slug,
  title,
  sourceBlobHash: `p${id}`,
  position,
  yawOffset,
  defaultYaw: 0,
  thumbnailBlobHash: null,
  updatedAt: "2026-09-08T11:20:00Z",
});

const CONTROL_ROOM = panorama(
  1,
  "control-room-north-door",
  "Control room, north door",
  { x: 4.82, y: 1.7, z: -2.145 },
  degToRad(137.5),
);
// Still at the origin: the View tab reads that as "not calibrated yet".
const TANK_YARD = panorama(2, "tank-yard-west-gate", "Tank yard, west gate");
const PANORAMAS = [CONTROL_ROOM, TANK_YARD];

const pdf = (id: number, title: string): Document => ({
  id,
  territorySlug: "refinery-block-c",
  title,
  sourceBlobHash: `d${id}`,
  createdAt: "2026-09-05T08:40:00Z",
});

const DOCUMENTS = [pdf(1, "plan-sheet-03.pdf"), pdf(2, "fire-safety-zones.pdf")];

// A File the browser never produced — the upload card reads a name and a size.
const PHOTO = { name: "pump-house-south.jpg", size: 24_600_000 } as unknown as File;
const UPLOADING: FileUploadState = {
  stage: "uploading",
  file: PHOTO,
  percent: 38,
  label: "Reading EXIF · 38 %",
};

/** Two of the four placements are inside the control room; the footer counts them. */
const markedIn = (p: PageParts): ResolvedPlacement[] =>
  p.placements.map((x) => ({ ...x, visiblePanoramaIds: x.id === 1 || x.id === 4 ? [1] : [2] }));

/**
 * State 13 selects instance #2 and mock 13 draws it ticked for the control
 * room and not for the tank yard, so that one placement's allowlist differs
 * from state 8's — where #1 and #4 are the two the photo marks.
 */
const markedForSelected = (p: PageParts): ResolvedPlacement[] =>
  markedIn(p).map((x) => (x.id === 2 ? { ...x, visiblePanoramaIds: [1] } : x));

/** Everything the two panorama states share: the captures and the camera's place. */
const captures = (p: PageParts): PageParts => ({
  ...p,
  placements: markedIn(p),
  panel: { tab: "view", collapsed: false },
  panoramas: { ...p.panoramas, list: PANORAMAS, index: { current: 1, total: 2 } },
  mode: { ...p.mode, view: { kind: "panorama", id: 1 } },
  // Inside a capture the photo is what is on screen; the mesh behind it is at
  // its finest level, which is what the strip reports.
  view: {
    ...p.view,
    targetLod: 0,
    report: { shown: 0, target: 0, percent: null, progressText: null, failure: null },
  },
});

const inside = (p: PageParts): PageParts => {
  const q = captures(p);
  return { ...q, panoramas: { ...q.panoramas, active: CONTROL_ROOM } };
};

/** The anchor card open on the capture the camera is in, mid-calibration. */
const editing = (p: PageParts): PageParts => {
  const q = inside(p);
  return {
    ...q,
    mode: { ...q.mode, editingPanoramaId: 1 },
    panoramas: {
      ...q.panoramas,
      editing: CONTROL_ROOM,
      calibration: {
        ...q.panoramas.calibration,
        active: true,
        effective: CONTROL_ROOM,
        draft: { position: CONTROL_ROOM.position, yawOffset: CONTROL_ROOM.yawOffset },
        opacity: 0.65,
      },
    },
  };
};

/** The panorama upload dialog, before a file is picked and while one travels. */
const uploading = (p: PageParts, state: FileUploadState | null): PageParts => {
  const q = captures(p);
  const form = q.panoramas.upload.form;
  return {
    ...q,
    panoramas: {
      ...q.panoramas,
      upload: {
        ...q.panoramas.upload,
        open: true,
        form: state
          ? { ...form, upload: state, title: "Pump house, south wall" }
          : form,
      },
    },
  };
};

// Where `usePipWindow(14)` docks a 560×400 window in a 1440×900 browser: the
// fixture cannot run the hook, so it states the same answer.
const DOCKED = { x: 866, y: 486, w: 560, h: 400 };

const withDocuments = (p: PageParts, window: PageParts["documents"]["window"]): PageParts => ({
  ...p,
  // The panel is folded away: the mock draws the window over the bare scene.
  panel: { tab: "view", collapsed: true },
  documents: {
    ...p.documents,
    list: DOCUMENTS,
    active: DOCUMENTS[0],
    window,
    pip: { ...p.documents.pip, geo: DOCKED },
  },
});

export default {
  // 8 — inside «Control room, north door»: two placements marked on the photo.
  "8-panorama": page(inside),

  // 9 — the anchor card and the calibration block over it. The panel's
  // `scrolled · metadata above` strip appears once the body is scrolled.
  "9-panorama-edit": page(editing),

  // 10 — the upload dialog, idle and mid-upload. One dialog serves both kinds.
  "10-upload-panorama": page((p) => uploading(p, null)),
  "10b-uploading": page((p) => uploading(p, UPLOADING)),

  "11-upload-document": page((p) => ({
    ...p,
    panel: { tab: "view", collapsed: false },
    documents: {
      ...p.documents,
      list: DOCUMENTS,
      upload: { ...p.documents.upload, open: true },
    },
  })),

  // 12 — the PDF over the scene, in its three window modes.
  "12-document-pip": page((p) => withDocuments(p, "pip")),
  "12-collapsed": page((p) => withDocuments(p, "collapsed")),
  "12-expanded": page((p) => withDocuments(p, "expanded")),

  // 13 — which captures mark this object, chosen from the 3D scene.
  "13-visible-in": page((p) => ({
    ...selected(p),
    grants: NO_DELETE,
    placements: markedForSelected(p),
    panoramas: { ...p.panoramas, list: PANORAMAS },
  })),
};
