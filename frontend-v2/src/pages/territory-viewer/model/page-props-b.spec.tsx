import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { assetUrl } from "@/entities/content";
import type { Document } from "@/entities/document";
import type { Panorama } from "@/entities/panorama";
import { groupByModel, type ResolvedPlacement } from "@/entities/placement";
import type { ModelOption } from "@/entities/scene";
import { insideFooter, LOADING_FOOTER } from "@/widgets/view-tab";
import { basePageParts } from "../territory-viewer-page.fixture";
import {
  documentProps,
  markerLabels,
  panoramaCanvasProps,
  uploadProps,
  viewTabProps,
} from "./page-props-b";
import type { PageParts } from "./viewer-props";

const panorama = (id: number, over: Partial<Panorama> = {}): Panorama => ({
  id,
  territorySlug: "refinery-block-c",
  slug: `capture-${id}`,
  title: `Capture ${id}`,
  sourceBlobHash: `p${id}`,
  position: { x: 1, y: 0, z: 2 },
  yawOffset: 0,
  defaultYaw: 0,
  updatedAt: "2026-09-14T10:00:00Z",
  ...over,
});

const doc = (id: number, title: string): Document => ({
  id,
  territorySlug: "refinery-block-c",
  title,
  sourceBlobHash: `d${id}`,
  createdAt: "2026-09-14T10:00:00Z",
});

/** The page's parts with the panorama slice populated — the rest is the fixture's. */
const withPanoramas = (list: Panorama[], over: Partial<PageParts["panoramas"]> = {}): PageParts => {
  const p = basePageParts();
  return { ...p, panoramas: { ...p.panoramas, list, ...over } };
};

describe("viewTabProps · panoramas", () => {
  it("builds one row per capture: its photo, whether it is entered, and whether it is calibrated", () => {
    const rows = viewTabProps(
      withPanoramas([panorama(1), panorama(2, { position: { x: 0, y: 0, z: 0 } })]),
    ).panoramas.rows;

    expect(rows).toEqual([
      {
        id: 1,
        title: "Capture 1",
        thumbUrl: assetUrl("p1"),
        active: false,
        calibrated: true,
        canEdit: true,
        editing: false,
      },
      {
        id: 2,
        title: "Capture 2",
        thumbUrl: assetUrl("p2"),
        active: false,
        // Nothing has moved this anchor off the origin, so it cannot be entered.
        calibrated: false,
        canEdit: true,
        editing: false,
      },
    ]);
  });

  it("marks the panorama the camera is inside, and the one whose anchor card is open", () => {
    const p = withPanoramas([panorama(1), panorama(2)]);
    const rows = viewTabProps({
      ...p,
      mode: { ...p.mode, view: { kind: "panorama", id: 2 }, editingPanoramaId: 1 },
    }).panoramas.rows;

    expect(rows.map((r) => [r.id, r.active, r.editing])).toEqual([
      [1, false, true],
      [2, true, false],
    ]);
  });

  it("refuses the row's editing affordance to a reader who cannot write panoramas", () => {
    const p = withPanoramas([panorama(1)]);
    const rows = viewTabProps({
      ...p,
      grants: { ...p.grants, panoramaWrite: false },
    }).panoramas.rows;
    expect(rows[0].canEdit).toBe(false);
  });

  it("names the panorama being calibrated, for the callout above the rows", () => {
    const p = withPanoramas([panorama(1, { title: "Control room" })], {
      editing: panorama(1, { title: "Control room" }),
    });
    const props = viewTabProps({
      ...p,
      panoramas: { ...p.panoramas, calibration: { ...p.panoramas.calibration, active: true } },
    });
    expect(props.panoramas.calibrating).toEqual({ title: "Control room" });
  });

  it("says nothing is being calibrated while the card is merely open", () => {
    expect(viewTabProps(withPanoramas([panorama(1)])).panoramas.calibrating).toBeNull();
  });

  it("hands the section the upload grant and the tour link's own", () => {
    const p = withPanoramas([]);
    const props = viewTabProps({
      ...p,
      grants: { ...p.grants, panoramaCreate: false, replace: false },
      panoramas: { ...p.panoramas, link: { ...p.panoramas.link, url: "https://tour.example" } },
    });
    expect(props.panoramas.canUpload).toBe(false);
    expect(props.panoramas.link).toMatchObject({ url: "https://tour.example", canEdit: false });
  });

  it("offers Move points to a panorama writer, and reports the sub-mode it toggles", () => {
    const p = withPanoramas([panorama(1)]);
    const props = viewTabProps({ ...p, mode: { ...p.mode, move: true } });
    expect(props.panoramas.canMovePoints).toBe(true);
    expect(props.panoramas.moving).toBe(true);
  });

  it("draws no Move points inside a panorama — the anchors are dragged on the model", () => {
    // B-5: the sub-mode cannot be entered from inside a capture (the reducer
    // refuses V there), so the button must not be drawn offering it.
    const p = withPanoramas([panorama(1)]);
    const inside = viewTabProps({
      ...p,
      mode: { ...p.mode, view: { kind: "panorama", id: 1 } },
    });
    expect(inside.panoramas.canMovePoints).toBe(false);
  });

  it("builds the anchor card only for the panorama being edited", () => {
    expect(viewTabProps(withPanoramas([panorama(1)])).panoramas.editor).toBeNull();

    const editing = panorama(1);
    const props = viewTabProps(withPanoramas([editing], { editing, index: { current: 1, total: 3 } }));
    const card = props.panoramas.editor;
    expect(isValidElement(card)).toBe(true);
    expect((card as { props: Record<string, unknown> }).props).toMatchObject({
      panorama: editing,
      index: { current: 1, total: 3 },
      inside: false,
      canDelete: true,
    });
  });

  it("tells the card its photo failed, so it offers no calibration of a sphere nobody can see", () => {
    const editing = panorama(1);
    const props = viewTabProps(
      withPanoramas([editing], {
        editing,
        texture: { bitmap: null, progress: null, status: "error" },
      }),
    );
    expect((props.panoramas.editor as { props: { failed: boolean } }).props.failed).toBe(true);
  });
});

describe("viewTabProps · documents and the footer", () => {
  const withDocuments = (list: Document[]): PageParts => {
    const p = basePageParts();
    return { ...p, documents: { ...p.documents, list } };
  };

  it("names each attached PDF and passes the upload grant through", () => {
    const p = withDocuments([doc(7, "Fire plan.pdf")]);
    expect(viewTabProps(p).documents).toMatchObject({
      rows: [{ id: 7, name: "Fire plan.pdf" }],
      canUpload: true,
    });
    expect(
      viewTabProps({ ...p, grants: { ...p.grants, documentWrite: false } }).documents.canUpload,
    ).toBe(false);
  });

  it("explains that both overlays stay clickable while a level downloads", () => {
    const p = basePageParts();
    expect(
      viewTabProps({
        ...p,
        view: {
          ...p.view,
          report: { shown: 2, target: 0, percent: 62, progressText: "6.1 / 9.8 MB", failure: null },
        },
      }).footer,
    ).toBe(LOADING_FOOTER);
  });

  it("counts the placements this panorama marks once the camera is inside it", () => {
    const p = withPanoramas([panorama(1)]);
    const seen: ResolvedPlacement[] = p.placements.map((x, i) =>
      i < 2 ? { ...x, visiblePanoramaIds: [1] } : x,
    );
    expect(
      viewTabProps({
        ...p,
        placements: seen,
        mode: { ...p.mode, view: { kind: "panorama", id: 1 } },
      }).footer,
    ).toBe(insideFooter(2));
  });

  it("says nothing under the sections in the 3D view", () => {
    expect(viewTabProps(basePageParts()).footer).toBeNull();
  });

  it("drops the vertex and face counts from the facts inside a panorama", () => {
    const p = basePageParts();
    const inside = viewTabProps({
      ...p,
      mode: { ...p.mode, view: { kind: "panorama", id: 1 } },
    }).details.map((d) => d.label);
    expect(inside).toEqual(["slug", "units", "uploaded"]);
    expect(viewTabProps(p).details.map((d) => d.label)).toContain("vertices");
  });
});

describe("panoramaCanvasProps", () => {
  it("hands the sphere the calibration draft while one is open, and the saved anchor otherwise", () => {
    const active = panorama(1);
    const effective = panorama(1, { yawOffset: 0.4 });
    const p = withPanoramas([active], { active });
    expect(panoramaCanvasProps(p, []).activePanorama).toBe(active);

    const calibrating = {
      ...p,
      panoramas: {
        ...p.panoramas,
        active,
        calibration: { ...p.panoramas.calibration, active: true, effective },
      },
    };
    const props = panoramaCanvasProps(calibrating, []);
    expect(props.activePanorama).toBe(effective);
    expect(props.calibrationGhost).toBeNull();
  });

  it("calibrates from the 3D view against a free camera: the draft is a ghost, not the active capture", () => {
    // `PanoramaRig` mounts on `activePanorama` alone. Substituting the draft
    // there pins the camera onto the anchor and takes the 3D view — the one
    // place the ring can be dragged against the mesh — away.
    const effective = panorama(1, { position: { x: 9, y: 9, z: 9 } });
    const p = withPanoramas([panorama(1), panorama(2)]);
    expect(panoramaCanvasProps(p, []).calibrationGhost).toBeNull();

    const calibrating = {
      ...p,
      panoramas: {
        ...p.panoramas,
        calibration: { ...p.panoramas.calibration, active: true, effective },
      },
    };
    const props = panoramaCanvasProps(calibrating, []);
    expect(props.activePanorama).toBeNull();
    expect(props.calibrationGhost).toBe(effective);
  });

  it("ghosts the photo only while it is being calibrated against the mesh", () => {
    const p = withPanoramas([panorama(1)]);
    expect(panoramaCanvasProps(p, []).panoramaOpacity).toBe(1);

    const calibrating = {
      ...p,
      panoramas: {
        ...p.panoramas,
        calibration: { ...p.panoramas.calibration, active: true, opacity: 0.35 },
      },
    };
    expect(panoramaCanvasProps(calibrating, []).panoramaOpacity).toBe(0.35);
  });

  it("tells the canvas the alignment is open, and still hands it the saved rows", () => {
    // The list is reference only while an alignment is open: the one anchor
    // drawn is the draft, and the canvas reads it off `calibrationGhost`.
    const p = withPanoramas([panorama(1), panorama(2)]);
    expect(panoramaCanvasProps(p, []).calibrating).toBe(false);

    const calibrating = {
      ...p,
      panoramas: {
        ...p.panoramas,
        calibration: {
          ...p.panoramas.calibration,
          active: true,
          effective: panorama(1, { position: { x: 9, y: 9, z: 9 } }),
        },
      },
    };
    const props = panoramaCanvasProps(calibrating, []);
    expect(props.calibrating).toBe(true);
    expect(props.panoramas).toBe(p.panoramas.list);
  });

  it("hands the viewport markers the panel's own numbering, and the way into a capture", () => {
    const active = panorama(1);
    const p = withPanoramas([active], { active });
    const groups = groupByModel(p.placements, [
      { slug: "storage-tank-500", title: "storage-tank-500" },
      { slug: "valve-assembly", title: "valve-assembly" },
    ]);
    const props = panoramaCanvasProps(p, groups);
    expect(props.markerLabels).toEqual({
      1: "storage-tank-500 #1",
      2: "storage-tank-500 #2",
      3: "storage-tank-500 #3",
      4: "valve-assembly #1",
    });
    expect(props.onActivatePanorama).toBe(p.panoramas.onEnter);
  });

  it("passes the texture, the markers and the live drag straight through", () => {
    const p = withPanoramas([panorama(1)], { showMarkers: false });
    const moving = {
      ...p,
      mode: { ...p.mode, move: true },
      panoramas: {
        ...p.panoramas,
        drag: { ...p.panoramas.drag, draggingId: 1, livePos: { x: 1, y: 2, z: 3 } },
      },
    };
    const props = panoramaCanvasProps(moving, []);
    expect(props.showMarkers).toBe(false);
    expect(props.panoramas).toBe(moving.panoramas.list);
    expect(props.move).toEqual({ active: true, draggingId: 1, livePos: { x: 1, y: 2, z: 3 } });
    expect(props.panoramaStatus).toBe("idle");
  });
});

describe("markerLabels", () => {
  const OPTIONS: ModelOption[] = [
    { slug: "storage-tank-500", title: "storage-tank-500", chain: [] },
  ];
  const placement = (id: number): ResolvedPlacement => ({
    id,
    territorySlug: "refinery-block-c",
    modelSlug: "storage-tank-500",
    label: "",
    updatedAt: "2026-09-14T10:00:00Z",
    visiblePanoramaIds: [],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    chain: [],
  });

  it("numbers two instances of one model the way the panel does", () => {
    expect(markerLabels(groupByModel([placement(4), placement(9)], OPTIONS))).toEqual({
      4: "storage-tank-500 #1",
      9: "storage-tank-500 #2",
    });
  });

  it("has nothing to label in an empty scene", () => {
    expect(markerLabels([])).toEqual({});
  });
});

describe("documentProps", () => {
  const open = (window: PageParts["documents"]["window"]): PageParts => {
    const p = basePageParts();
    const active = doc(7, "Fire plan.pdf");
    return { ...p, documents: { ...p.documents, list: [active], active, window } };
  };

  it("draws nothing at all while no document is open", () => {
    expect(documentProps(basePageParts())).toEqual({ window: null, meta: null });
  });

  it("mounts the window and says so in the header meta", () => {
    const { window, meta } = documentProps(open("pip"));
    expect(window).toMatchObject({ window: "pip", canDelete: true });
    expect(window?.document.title).toBe("Fire plan.pdf");
    expect(meta).toBe("document overlay open");
  });

  it("names the expanded window in the meta, so the header says which it is", () => {
    expect(documentProps(open("expanded")).meta).toBe("document overlay expanded");
  });

  it("keeps the window mounted when it is hidden — the widget draws its own pill", () => {
    // Collapsed only hides the frame: unmounting it would throw away the
    // reader's page and zoom.
    expect(documentProps(open("collapsed")).window?.window).toBe("collapsed");
  });

  it("refuses Delete to a reader without the grant", () => {
    const p = open("pip");
    expect(
      documentProps({ ...p, grants: { ...p.grants, documentDelete: false } }).window?.canDelete,
    ).toBe(false);
  });
});

describe("uploadProps", () => {
  it("offers no dialog while neither upload is open", () => {
    expect(uploadProps(basePageParts())).toBeNull();
  });

  it("builds the panorama dialog, GPS box and all, from the form the hook owns", () => {
    const p = basePageParts();
    const props = uploadProps({
      ...p,
      panoramas: { ...p.panoramas, upload: { ...p.panoramas.upload, open: true } },
    });
    expect(props).toMatchObject({ open: true, kind: "panorama", territoryTitle: "Refinery Block C" });
    expect(props?.gps).toMatchObject({ checked: true });
  });

  it("builds the document dialog without one — a PDF has no anchor to place", () => {
    const p = basePageParts();
    const props = uploadProps({
      ...p,
      documents: { ...p.documents, upload: { ...p.documents.upload, open: true } },
    });
    expect(props).toMatchObject({ open: true, kind: "document" });
    expect(props?.gps).toBeUndefined();
  });
});
