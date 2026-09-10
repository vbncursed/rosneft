import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { vi } from "vitest";
import { createElement, type ReactNode } from "react";

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
