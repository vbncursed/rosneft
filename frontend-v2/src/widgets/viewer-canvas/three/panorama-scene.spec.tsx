import ReactThreeTestRenderer from "@react-three/test-renderer";
import { createElement } from "react";
import type { Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Panorama } from "@/entities/panorama";
import PanoramaScene from "./panorama-scene";

// The rig, the drag controller and the overlay render nothing findable under
// the test renderer (two return null, the third portals through drei <Html>),
// and the markers are DOM. Named groups carrying the props they were handed
// are what a scene-graph spec can assert on; each has its own spec besides.
vi.mock("./panorama-rig", () => ({
  default: ({ panorama }: { panorama: Panorama }) =>
    createElement("group", { name: "PanoramaRig", userData: { id: panorama.id } }),
}));
vi.mock("./panorama-loading-overlay", () => ({
  default: ({ progress }: { progress: number | null }) =>
    createElement("group", { name: "PanoramaLoadingOverlay", userData: { progress } }),
}));
vi.mock("./panorama-markers-layer", () => ({
  default: ({
    panoramas,
    moveMode,
    editingId,
  }: {
    panoramas: Panorama[];
    moveMode: boolean;
    editingId: number | null;
  }) =>
    createElement("group", {
      name: "PanoramaMarkersLayer",
      userData: { ids: panoramas.map((p) => p.id), moveMode, editingId },
    }),
}));
vi.mock("./panorama-drag-controller", () => ({
  default: ({ dragging }: { dragging: boolean }) =>
    createElement("group", { name: "PanoramaDragController", userData: { dragging } }),
}));

const PANO: Panorama = {
  id: 7,
  territorySlug: "t",
  slug: "control-room",
  title: "Control room",
  sourceBlobHash: "h",
  position: { x: 1, y: 2, z: 3 },
  yawOffset: 0,
  defaultYaw: 0,
  updatedAt: "",
};

// The same capture with the calibration draft applied: a different anchor, so
// a sphere at [9, 9, 9] can only have come from the draft.
const DRAFT: Panorama = { ...PANO, position: { x: 9, y: 9, z: 9 } };

const STILL = { active: false, draggingId: null, livePos: null };

// jsdom has no ImageBitmap, and nothing here uploads one to a GL context.
const fakeBitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

type Props = Parameters<typeof PanoramaScene>[0];

const mount = (over: Partial<Props> = {}) =>
  ReactThreeTestRenderer.create(
    <PanoramaScene
      activePanorama={null}
      calibrationGhost={null}
      bitmap={null}
      status="idle"
      progress={null}
      opacity={1}
      panoramas={[PANO]}
      showMarkers
      pointMode={false}
      calibrating={false}
      move={STILL}
      territoryRef={{ current: null }}
      onActivate={vi.fn()}
      onGrab={vi.fn()}
      onMove={vi.fn()}
      onDrop={vi.fn()}
      {...over}
    />,
  );

const named = (r: Awaited<ReturnType<typeof mount>>, name: string) =>
  r.scene.findAll((n) => n.instance.name === name);

const spheres = (r: Awaited<ReturnType<typeof mount>>) =>
  r.scene.findAll((n) => (n.instance as Mesh).isMesh === true);

const ready = { activePanorama: PANO, bitmap: fakeBitmap(), status: "ready" as const };

describe("PanoramaScene", () => {
  it("puts the reader inside the equirect once it has decoded, with the rig holding the camera", async () => {
    const r = await mount(ready);
    expect(spheres(r)).toHaveLength(1);
    expect(spheres(r)[0].instance.position.toArray()).toEqual([1, 2, 3]);
    expect(named(r, "PanoramaRig")[0].instance.userData.id).toBe(7);
    expect(named(r, "PanoramaLoadingOverlay")).toHaveLength(0);
  });

  it("covers the wait rather than showing a blank switch", async () => {
    const r = await mount({ activePanorama: PANO, status: "loading", progress: 40 });
    expect(named(r, "PanoramaLoadingOverlay")[0].instance.userData.progress).toBe(40);
    expect(spheres(r)).toHaveLength(0);
  });

  it("draws no sphere when the texture failed", async () => {
    const r = await mount({ activePanorama: PANO, status: "error" });
    expect(spheres(r)).toHaveLength(0);
    expect(named(r, "PanoramaLoadingOverlay")).toHaveLength(0);
  });

  it("ghosts the equirect for calibration", async () => {
    const r = await mount({ ...ready, opacity: 0.4 });
    expect((spheres(r)[0].instance as Mesh).renderOrder).toBe(1000);
  });

  it("offers the anchors in the 3D view, and drags them in move mode", async () => {
    const r = await mount({ move: { active: true, draggingId: 7, livePos: null } });
    const markers = named(r, "PanoramaMarkersLayer")[0];
    expect(markers.instance.userData).toEqual({ ids: [7], moveMode: true, editingId: null });
    expect(named(r, "PanoramaDragController")[0].instance.userData.dragging).toBe(true);
  });

  it("hides the anchors inside a panorama — the reader is standing on one", async () => {
    const r = await mount(ready);
    expect(named(r, "PanoramaMarkersLayer")).toHaveLength(0);
  });

  it("hangs the draft around the 3D view as a ghosted backdrop, with no rig to pin the camera", async () => {
    // Calibration from the 3D view keeps the free camera: the photo is a
    // backdrop behind the terrain, and the rig — which teleports the eye onto
    // the anchor — must stay unmounted.
    const r = await mount({
      calibrationGhost: DRAFT,
      bitmap: fakeBitmap(),
      status: "ready",
      opacity: 0.5,
      calibrating: true,
    });
    expect(spheres(r)).toHaveLength(1);
    expect(spheres(r)[0].instance.position.toArray()).toEqual([9, 9, 9]);
    expect((spheres(r)[0].instance as Mesh).renderOrder).toBe(1000);
    expect(named(r, "PanoramaRig")).toHaveLength(0);
  });

  it("draws the anchor being aligned, alone and grabbable, over that backdrop", async () => {
    const r = await mount({
      calibrationGhost: DRAFT,
      bitmap: fakeBitmap(),
      status: "ready",
      opacity: 0.5,
      calibrating: true,
      panoramas: [PANO, { ...PANO, id: 8 }],
    });
    const markers = named(r, "PanoramaMarkersLayer")[0];
    // The draft, not the saved row: the ring follows the nudge buttons too.
    expect(markers.instance.userData).toEqual({ ids: [7], moveMode: true, editingId: 7 });
  });

  it("keeps V from reaching any other anchor while an alignment is open", async () => {
    // Move mode is live in the 3D view, and a drop there is a PUT. The layer
    // is handed one anchor, so there is nothing else to grab by construction.
    const r = await mount({
      calibrationGhost: DRAFT,
      bitmap: fakeBitmap(),
      status: "ready",
      opacity: 0.5,
      calibrating: true,
      panoramas: [PANO, { ...PANO, id: 8 }],
      move: { active: true, draggingId: null, livePos: null },
    });
    expect(named(r, "PanoramaMarkersLayer")[0].instance.userData.ids).toEqual([7]);
  });

  it("draws no anchor inside the capture being calibrated — the ring is not drawable there", async () => {
    // Inside, the rig stands the camera on the anchor: its marker projects
    // onto the eye. Nudge and yaw are the tools there.
    // Inside, the page hands the draft as the active capture itself, so the
    // sphere and the rig both follow the nudge row; there is no ghost.
    const r = await mount({ ...ready, activePanorama: DRAFT, opacity: 0.5, calibrating: true });
    expect(named(r, "PanoramaMarkersLayer")).toHaveLength(0);
    expect(named(r, "PanoramaRig")[0].instance.userData.id).toBe(7);
    expect(spheres(r)[0].instance.position.toArray()).toEqual([9, 9, 9]);
  });

  it("hides the anchors while points are being picked, and when the reader turned them off", async () => {
    expect(named(await mount({ pointMode: true }), "PanoramaMarkersLayer")).toHaveLength(0);
    expect(named(await mount({ showMarkers: false }), "PanoramaMarkersLayer")).toHaveLength(0);
  });

  it("draws the ring being aligned whatever the markers switch and the mode say", async () => {
    // It is the alignment's own control, not a marker. `showMarkers` is
    // remembered in localStorage across sessions and territories, so a reader
    // who turned anchors off months ago would open Calibrate to no ring, no
    // explanation and a feature that reads as broken. `M` did the same.
    const calibrating = {
      calibrationGhost: DRAFT,
      bitmap: fakeBitmap(),
      status: "ready" as const,
      opacity: 0.5,
      calibrating: true,
    };
    const off = await mount({ ...calibrating, showMarkers: false });
    expect(named(off, "PanoramaMarkersLayer")[0].instance.userData).toEqual({
      ids: [7],
      moveMode: true,
      editingId: 7,
    });
    const measuring = await mount({ ...calibrating, pointMode: true });
    expect(named(measuring, "PanoramaMarkersLayer")[0].instance.userData.ids).toEqual([7]);
  });

  it("reports the backdrop's download in the 3D view too", async () => {
    // Several seconds of a multi-megabyte equirect with no signal at all read
    // as `Calibrate (overlay)` doing nothing.
    const r = await mount({ calibrationGhost: DRAFT, status: "loading", progress: 40, calibrating: true });
    expect(named(r, "PanoramaLoadingOverlay")[0].instance.userData.progress).toBe(40);
  });

  it("keeps the drag controller mounted so a release always lands", async () => {
    const r = await mount(ready);
    expect(named(r, "PanoramaDragController")[0].instance.userData.dragging).toBe(false);
  });
});
