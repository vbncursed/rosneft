import ReactThreeTestRenderer from "@react-three/test-renderer";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Placement } from "@/entities/placement";
import type { GizmoMode } from "@/features/viewer-mode";
import PlacementsLayer from "./placements-layer";
import { fakePlacement } from "./testing";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

// drei's <Html> does not portal under the test renderer, so the real markers
// would leave nothing to find. A named group carrying the ids it was handed is
// what a scene-graph spec can assert on.
vi.mock("./placement-markers", () => ({
  default: ({ placements }: { placements: Placement[] }) =>
    createElement("group", {
      name: "PlacementMarkers",
      userData: { ids: placements.map((p) => p.id) },
    }),
}));

const layer = (over: Partial<Parameters<typeof PlacementsLayer>[0]> = {}) => (
  <PlacementsLayer
    placements={[fakePlacement(1), fakePlacement(2)]}
    selectedId={2}
    mode={"translate" as GizmoMode}
    measureMode={false}
    canEdit
    territoryRef={{ current: null }}
    snapEnabled={false}
    activePanoramaId={null}
    markerLabels={{}}
    showMarkers
    onSelect={vi.fn()}
    onCommit={vi.fn()}
    {...over}
  />
);

const instances = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  r.scene.findAll((n) => n.instance.userData?.placementId !== undefined);

const gizmos = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  r.scene.findAll((n) => n.instance.name === "TransformControls");

const markers = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  r.scene.findAll((n) => n.instance.name === "PlacementMarkers");

/** Placement 1 is dropped for panorama 3; placement 2 is hidden in every one. */
const inPanorama = () => {
  const [one, two] = [fakePlacement(1), fakePlacement(2)];
  return [{ ...one, visiblePanoramaIds: [3] }, two];
};

describe("PlacementsLayer", () => {
  it("mounts one clone per placement at its transform, and a gizmo only for the selection", async () => {
    const r = await ReactThreeTestRenderer.create(layer());
    expect(instances(r).map((g) => g.instance.userData.placementId)).toEqual([1, 2]);
    expect(instances(r)[1].instance.position.x).toBe(2);
    expect(gizmos(r)).toHaveLength(1);
    expect(gizmos(r)[0].instance.userData.gizmoMode).toBe("translate");
  });

  it("draws no gizmo in measure mode", async () => {
    const r = await ReactThreeTestRenderer.create(layer({ measureMode: true }));
    expect(instances(r)).toHaveLength(2);
    expect(gizmos(r)).toHaveLength(0);
  });

  it("draws no gizmo without the write grant", async () => {
    const r = await ReactThreeTestRenderer.create(layer({ canEdit: false }));
    expect(gizmos(r)).toHaveLength(0);
  });

  it("draws no gizmo with nothing selected", async () => {
    const r = await ReactThreeTestRenderer.create(layer({ selectedId: null }));
    expect(gizmos(r)).toHaveLength(0);
  });

  it("reports a click on an instance as a pick", async () => {
    const onSelect = vi.fn();
    const r = await ReactThreeTestRenderer.create(layer({ selectedId: null, onSelect }));
    await r.fireEvent(instances(r)[0], "click", { stopPropagation: vi.fn() });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows every placement in the 3D view, and names none of them", async () => {
    const r = await ReactThreeTestRenderer.create(
      layer({ placements: inPanorama(), selectedId: null, markerLabels: { 1: "a", 2: "b" } }),
    );
    expect(instances(r).map((g) => g.instance.userData.placementId)).toEqual([1, 2]);
    expect(markers(r)).toHaveLength(0);
  });

  it("shows only what a panorama allows, and names those", async () => {
    const r = await ReactThreeTestRenderer.create(
      layer({
        placements: inPanorama(),
        selectedId: null,
        activePanoramaId: 3,
        markerLabels: { 1: "a", 2: "b" },
      }),
    );
    expect(instances(r).map((g) => g.instance.userData.placementId)).toEqual([1]);
    expect(markers(r)).toHaveLength(1);
    expect(markers(r)[0].instance.userData.ids).toEqual([1]);
  });

  it("hides the names when the reader has turned markers off", async () => {
    const r = await ReactThreeTestRenderer.create(
      layer({
        placements: inPanorama(),
        selectedId: null,
        activePanoramaId: 3,
        showMarkers: false,
        markerLabels: { 1: "a" },
      }),
    );
    expect(instances(r)).toHaveLength(1);
    expect(markers(r)).toHaveLength(0);
  });

  it("lets a click fall through to the canvas while picking points", async () => {
    const onSelect = vi.fn();
    const r = await ReactThreeTestRenderer.create(
      layer({ selectedId: null, measureMode: true, onSelect }),
    );
    await r.fireEvent(instances(r)[0], "click", { stopPropagation: vi.fn() });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
