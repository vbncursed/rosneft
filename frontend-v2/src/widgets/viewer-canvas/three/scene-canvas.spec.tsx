import ReactThreeTestRenderer from "@react-three/test-renderer";
import { createElement, type ComponentType } from "react";
import { Texture, type BufferGeometry, type Color, type Mesh, type Scene } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Panorama } from "@/entities/panorama";
import type { ViewerCanvasProps } from "../ui/props";
import SceneCanvas from "./scene-canvas";
import { boundsStub, fakePlacement, lineColors } from "./testing";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

// The KTX2 capability probe reads a real WebGL context; the test renderer's
// stub has none. It is one of the three exempt setup modules for that reason.
vi.mock("./ktx2-init", () => ({ default: () => null }));

// <Canvas> owns a WebGL context jsdom cannot give it. Replaced by a
// passthrough so its children mount in the test renderer's own scene, with
// the props it was handed captured for the pointer-missed assertions.
const canvas = vi.hoisted(() => ({ props: {} as Record<string, () => void> }));
vi.mock("@react-three/fiber", async (orig) => {
  const real = (await (orig as () => Promise<Record<string, unknown>>)()) as Record<
    string,
    unknown
  >;
  return {
    ...real,
    Canvas: (p: { children: unknown }) => {
      canvas.props = p as unknown as Record<string, () => void>;
      return p.children;
    },
  };
});

// Recorded-and-forwarded: these two carry props that decide behaviour but
// leave no trace in the scene graph (a raycast flag, a snap flag), and both
// have to keep rendering for real — the Bounds/FocusOn case depends on it.
const seen = vi.hoisted(() => ({
  gltf: {} as Record<string, unknown>,
  layer: {} as Record<string, unknown>,
}));
vi.mock("./gltf-model", async (orig) => {
  const real = ((await orig()) as { default: ComponentType<Record<string, unknown>> }).default;
  return {
    default: (p: Record<string, unknown>) => {
      seen.gltf = p;
      return createElement(real, p);
    },
  };
});
vi.mock("./placements-layer", async (orig) => {
  const real = ((await orig()) as { default: ComponentType<Record<string, unknown>> }).default;
  return {
    default: (p: Record<string, unknown>) => {
      seen.layer = p;
      return createElement(real, p);
    },
  };
});

const COLORS = { background: "#16181b", grid: "#282c31", accent: "#f97316" };

const PANO: Panorama = {
  id: 7,
  territorySlug: "t",
  slug: "control-room",
  title: "Control room",
  sourceBlobHash: "h",
  position: { x: 0, y: 0, z: 0 },
  yawOffset: 0,
  defaultYaw: 0,
  updatedAt: "",
};

const STILL = { active: false, draggingId: null, livePos: null };

const props = (over: Partial<ViewerCanvasProps> = {}): ViewerCanvasProps => ({
  slug: "t",
  parentLods: [],
  targetLod: 0,
  placements: [],
  mode: "orbit",
  selectedId: null,
  gizmo: "translate",
  snap: false,
  canWrite: false,
  chains: [],
  activeChainId: null,
  unitRatio: 1,
  resetVersion: 0,
  retryVersion: 0,
  focusRequest: null,
  activePanorama: null,
  panoramaTexture: null,
  panoramaStatus: "idle",
  panoramaProgress: null,
  panoramaOpacity: 1,
  panoramas: [PANO],
  showMarkers: true,
  markerLabels: {},
  move: STILL,
  cameraPositionRef: { current: null },
  cameraYawRef: { current: null },
  onPick: vi.fn(),
  onActivatePanorama: vi.fn(),
  onMarkerGrab: vi.fn(),
  onMarkerMove: vi.fn(),
  onMarkerDrop: vi.fn(),
  onTransformCommit: vi.fn(),
  onMeasurePoint: vi.fn(),
  onCloseActiveChain: vi.fn(),
  onRemoveSegment: vi.fn(),
  onRemoveChain: vi.fn(),
  onLod: vi.fn(),
  ...over,
});

const mount = (over: Partial<ViewerCanvasProps> = {}, colors = COLORS) =>
  ReactThreeTestRenderer.create(<SceneCanvas {...props(over)} colors={colors} />);

const grids = (r: Awaited<ReturnType<typeof mount>>) =>
  r.scene.findAll((n) => n.instance.type === "GridHelper");

const spheres = (r: Awaited<ReturnType<typeof mount>>) =>
  r.scene.findAll(
    (n) => ((n.instance as Mesh).geometry as BufferGeometry | undefined)?.type === "SphereGeometry",
  );

/** A panorama that has finished decoding, as the page hands it over. */
const inside = () => ({
  activePanorama: PANO,
  panoramaTexture: new Texture(),
  panoramaStatus: "ready" as const,
});

const ground = (r: Awaited<ReturnType<typeof mount>>) =>
  (r.scene.instance as unknown as Scene).background as Color;

const clickEvent = (point: { x: number; y: number; z: number }) => ({
  nativeEvent: { id: 1 },
  intersections: [{ point }],
  point,
  stopPropagation: vi.fn(),
});

beforeEach(() => {
  seen.gltf = {};
  seen.layer = {};
});

describe("SceneCanvas", () => {
  it("paints the ground and the grid from the theme's tokens, not a hard-coded viewer colour", async () => {
    const r = await mount();
    expect(ground(r).getHexString()).toBe("16181b");
    const grid = r.scene.findAll((n) => n.instance.type === "GridHelper");
    expect(grid).toHaveLength(1);
  });

  it("takes the light theme's ground when the tokens say so", async () => {
    const r = await mount({}, { ...COLORS, background: "#ffffff" });
    expect(ground(r).getHexString()).toBe("ffffff");
  });

  it("deselects on a click into empty space while orbiting", async () => {
    const onPick = vi.fn();
    await mount({ onPick });
    canvas.props.onPointerMissed();
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("leaves the pending point alone on a click into empty space while measuring", async () => {
    const onPick = vi.fn();
    await mount({ mode: "measure", onPick });
    canvas.props.onPointerMissed();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("reports the surface point of a click while measuring", async () => {
    const onMeasurePoint = vi.fn();
    const r = await mount({ mode: "measure", onMeasurePoint });
    const wrapper = r.scene.findAll((n) => n.props.onClick !== undefined)[0];
    await r.fireEvent(wrapper, "click", clickEvent({ x: 1, y: 2, z: 3 }));
    expect(onMeasurePoint).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
  });

  it("reports one point per click, not one per intersection", async () => {
    // R3F dispatches a synthetic event per raycast hit, all sharing one native
    // event; a chain would otherwise gain several points from a single click.
    const onMeasurePoint = vi.fn();
    const r = await mount({ mode: "measure", onMeasurePoint });
    const wrapper = r.scene.findAll((n) => n.props.onClick !== undefined)[0];
    const event = clickEvent({ x: 1, y: 2, z: 3 });
    await r.fireEvent(wrapper, "click", event);
    await r.fireEvent(wrapper, "click", { ...event, stopPropagation: vi.fn() });
    expect(onMeasurePoint).toHaveBeenCalledTimes(1);
  });

  it("frames the requested placements — which sit outside the Bounds group", async () => {
    // The territory mounts inside drei's own <group>; the placements are its
    // siblings under the scene wrapper. A frame resolved from the territory's
    // parent reaches only the Bounds group and never a placement.
    boundsStub.refresh.mockClear();
    boundsStub.fit.mockClear();
    await mount({ placements: [fakePlacement(1)], focusRequest: [1] });
    expect(boundsStub.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ min: expect.anything(), max: expect.anything() }),
    );
    expect(boundsStub.fit).toHaveBeenCalledTimes(1);
  });

  it("hands the measurement lines the accent the tokens hold", async () => {
    lineColors.length = 0;
    await mount({
      chains: [
        {
          id: 1,
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
          ],
          closed: false,
        },
      ],
    });
    expect(lineColors).toEqual(["#f97316"]);
  });

  it("picks no points at all while orbiting", async () => {
    const onMeasurePoint = vi.fn();
    const r = await mount({ onMeasurePoint });
    const wrapper = r.scene.findAll((n) => n.props.onClick !== undefined)[0];
    await r.fireEvent(wrapper, "click", clickEvent({ x: 1, y: 2, z: 3 }));
    expect(onMeasurePoint).not.toHaveBeenCalled();
  });
});

describe("SceneCanvas inside a panorama", () => {
  it("puts the reader inside the equirect and takes the grid away with the 3D view", async () => {
    const r = await mount(inside());
    expect(spheres(r)).toHaveLength(1);
    expect(grids(r)).toHaveLength(0);
  });

  it("keeps the grid while the 3D view is the thing being looked at", async () => {
    expect(grids(await mount())).toHaveLength(1);
  });

  it("refuses to snap a placement to a territory nobody can see", async () => {
    const r = await mount({ ...inside(), snap: true });
    expect(seen.layer.snapEnabled).toBe(false);
    expect(seen.layer.activePanoramaId).toBe(7);
    expect(grids(r)).toHaveLength(0);
  });

  it("snaps in the 3D view, where the surface is on screen", async () => {
    await mount({ snap: true });
    expect(seen.layer.snapEnabled).toBe(true);
    expect(seen.layer.activePanoramaId).toBeNull();
  });

  it("does not chase a focus request while a panorama holds the camera", async () => {
    boundsStub.fit.mockClear();
    await mount({ ...inside(), placements: [fakePlacement(1)], focusRequest: [1] });
    expect(boundsStub.fit).not.toHaveBeenCalled();
  });
});

describe("SceneCanvas while a marker is being moved", () => {
  it("makes the territory hittable so the cursor can be projected onto it", async () => {
    expect((await mount()) && seen.gltf.raycastable).toBe(false);
    await mount({ move: { active: true, draggingId: null, livePos: null } });
    expect(seen.gltf.raycastable).toBe(true);
  });

  it("makes the territory hittable while points are being picked, as before", async () => {
    await mount({ mode: "measure" });
    expect(seen.gltf.raycastable).toBe(true);
  });
});

describe("SceneCanvas camera tracking", () => {
  it("mirrors the live camera out to the panel, which sits outside the Canvas", async () => {
    const cameraPositionRef = { current: null };
    const cameraYawRef = { current: null };
    await mount({ cameraPositionRef, cameraYawRef });
    const at = cameraPositionRef.current as unknown as { x: number; y: number; z: number };
    expect([at.x, at.y, at.z].map(Math.round)).toEqual([0, 0, 5]);
    expect(Math.abs(cameraYawRef.current as unknown as number)).toBeCloseTo(Math.PI);
  });
});
