import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { GizmoMode } from "@/features/viewer-mode";
import PlacementsLayer from "./placements-layer";
import { fakePlacement } from "./testing";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

const layer = (over: Partial<Parameters<typeof PlacementsLayer>[0]> = {}) => (
  <PlacementsLayer
    placements={[fakePlacement(1), fakePlacement(2)]}
    selectedId={2}
    mode={"translate" as GizmoMode}
    measureMode={false}
    canEdit
    territoryRef={{ current: null }}
    snapEnabled={false}
    onSelect={vi.fn()}
    onCommit={vi.fn()}
    {...over}
  />
);

const instances = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  r.scene.findAll((n) => n.instance.userData?.placementId !== undefined);

const gizmos = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  r.scene.findAll((n) => n.instance.name === "TransformControls");

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

  it("lets a click fall through to the canvas while picking points", async () => {
    const onSelect = vi.fn();
    const r = await ReactThreeTestRenderer.create(
      layer({ selectedId: null, measureMode: true, onSelect }),
    );
    await r.fireEvent(instances(r)[0], "click", { stopPropagation: vi.fn() });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
