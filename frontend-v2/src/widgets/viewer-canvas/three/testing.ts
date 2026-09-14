import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Camera, type EventDispatcher } from "three";
import { useThree } from "@react-three/fiber";
import { vi } from "vitest";
import { createElement, useEffect, type ReactNode } from "react";

/** A parsed GLB stand-in: one box, enough for a clone and a raycast. */
export const fakeScene = () => {
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  return scene;
};

/** One placement, chain of one level, positioned at x = id. */
export const fakePlacement = (id: number) => ({
  id,
  territorySlug: "t",
  modelSlug: "m",
  label: "",
  updatedAt: "",
  visiblePanoramaIds: [] as number[],
  position: { x: id, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  chain: [{ lod: 0, hash: `h${id}`, size: 1 }],
});

export const boundsStub = { refresh: vi.fn().mockReturnThis(), fit: vi.fn() };

/** Every colour drei's <Line> was handed, in mount order. */
export const lineColors: string[] = [];

/**
 * drei without the network and without the DOM portals.
 *
 * Used from a spec's own `vi.mock` factory — that call is hoisted above every
 * import, so the factory reaches this module through a dynamic import:
 *
 *   vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));
 *
 * TransformControls is replaced by a named group carrying the gizmo mode: the
 * real one mounts under the test renderer but exposes no findable node — its
 * instance type is not "TransformControls" — so the group is what a spec can
 * assert on.
 *
 * Bounds interposes a real <group>, because the drei component does: a
 * passthrough here hid a Focus that could never reach a placement, since the
 * territory's parent is the Bounds group and not the scene wrapper.
 */
export async function mockDrei(orig: () => Promise<unknown>) {
  const real = (await orig()) as Record<string, unknown>;
  const useGLTF = Object.assign(vi.fn(() => ({ scene: fakeScene() })), {
    preload: vi.fn(),
    setDecoderPath: vi.fn(),
    clear: vi.fn(),
  });
  return {
    ...real,
    useGLTF,
    Html: () => null,
    Line: ({ color }: { color: string }) => {
      lineColors.push(color);
      return null;
    },
    AdaptiveDpr: () => null,
    Bounds: ({ children }: { children: ReactNode }) =>
      createElement("group", { name: "Bounds" }, children),
    useBounds: () => boundsStub,
    TransformControls: ({ mode }: { mode: string }) =>
      createElement("group", { name: "TransformControls", userData: { gizmoMode: mode } }),
  };
}

/**
 * OrbitControls as the rigs use it: a target, the flags they switch, and a
 * listener registry a spec can fire by hand. The real controls need a DOM
 * canvas with pointer events, and a spec that has to drag a mouse to check a
 * recentre is a spec nobody trusts.
 */
export const fakeControls = () => ({
  target: new Vector3(),
  enabled: true,
  enableZoom: true,
  enablePan: true,
  minDistance: 0.01,
  maxDistance: 100,
  listeners: new Map<string, Set<() => void>>(),
  addEventListener(type: string, listener: () => void) {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  },
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  },
  update: vi.fn(),
  /** What OrbitControls does after an orbit: tell everyone the view moved. */
  fire(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  },
});

/**
 * Publishes `controls` on the R3F store the way CameraRig does, so a component
 * that reads `useThree((s) => s.controls)` finds them, and hands the spec the
 * live camera through `probe`. Public API only — no reaching into the store.
 */
export function WithControls({
  controls,
  probe,
  children,
}: {
  controls: unknown;
  probe?: { camera?: Camera };
  children?: ReactNode;
}) {
  const set = useThree((s) => s.set);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // The probe is the spec's own object, handed in to be filled: the rule
    // cannot see that, and a callback would only move the same write one
    // frame out into every spec that mounts this.
    // oxlint-disable-next-line react/immutability
    if (probe) probe.camera = camera;
    set({ controls: controls as EventDispatcher });
  }, [set, camera, controls, probe]);
  return children;
}
