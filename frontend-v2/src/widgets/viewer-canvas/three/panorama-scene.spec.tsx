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
  default: ({ panoramas, moveMode }: { panoramas: Panorama[]; moveMode: boolean }) =>
    createElement("group", {
      name: "PanoramaMarkersLayer",
      userData: { ids: panoramas.map((p) => p.id), moveMode },
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

const STILL = { active: false, draggingId: null, livePos: null };

// jsdom has no ImageBitmap, and nothing here uploads one to a GL context.
const fakeBitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

type Props = Parameters<typeof PanoramaScene>[0];

const mount = (over: Partial<Props> = {}) =>
  ReactThreeTestRenderer.create(
    <PanoramaScene
      activePanorama={null}
      bitmap={null}
      status="idle"
      progress={null}
      opacity={1}
      panoramas={[PANO]}
      showMarkers
      pointMode={false}
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
    expect(markers.instance.userData).toEqual({ ids: [7], moveMode: true });
    expect(named(r, "PanoramaDragController")[0].instance.userData.dragging).toBe(true);
  });

  it("hides the anchors inside a panorama — the reader is standing on one", async () => {
    const r = await mount(ready);
    expect(named(r, "PanoramaMarkersLayer")).toHaveLength(0);
  });

  it("hides the anchors while points are being picked, and when the reader turned them off", async () => {
    expect(named(await mount({ pointMode: true }), "PanoramaMarkersLayer")).toHaveLength(0);
    expect(named(await mount({ showMarkers: false }), "PanoramaMarkersLayer")).toHaveLength(0);
  });

  it("keeps the drag controller mounted so a release always lands", async () => {
    const r = await mount(ready);
    expect(named(r, "PanoramaDragController")[0].instance.userData.dragging).toBe(false);
  });
});
