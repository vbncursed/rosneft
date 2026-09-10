import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, vi } from "vitest";
import PlacementInstance from "./placement-instance";
import { fakePlacement } from "./testing";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

const withChain = (chain: { lod: number; hash: string; size: number }[]) => ({
  ...fakePlacement(7),
  chain,
});

describe("PlacementInstance", () => {
  it("stamps the placement id and applies its transform to the group", async () => {
    const placement = fakePlacement(4);
    placement.rotation = { x: 0, y: 1, z: 0 };
    placement.scale = { x: 2, y: 2, z: 2 };
    const r = await ReactThreeTestRenderer.create(
      <PlacementInstance
        placement={placement}
        measureMode={false}
        onSelect={vi.fn()}
      />,
    );
    const group = r.scene.findAll((n) => n.instance.userData?.placementId === 4)[0];
    expect(group.instance.position.x).toBe(4);
    expect(group.instance.rotation.y).toBe(1);
    expect(group.instance.scale.x).toBe(2);
  });

  it("shows the coarsest level first and warms the target behind it", async () => {
    const drei = await import("@react-three/drei");
    vi.mocked(drei.useGLTF).mockClear();
    await ReactThreeTestRenderer.create(
      <PlacementInstance
        placement={withChain([
          { lod: 0, hash: "fine", size: 90 },
          { lod: 2, hash: "coarse", size: 10 },
        ])}
        measureMode={false}
        onSelect={vi.fn()}
      />,
    );
    const urls = vi.mocked(drei.useGLTF).mock.calls.map((c) => c[0]);
    expect(urls[0]).toContain("coarse");
    expect(urls).toContain("/api/assets/fine");
  });

  it("renders nothing for a model that has not been converted", async () => {
    const r = await ReactThreeTestRenderer.create(
      <PlacementInstance
        placement={withChain([])}
        measureMode={false}
        onSelect={vi.fn()}
      />,
    );
    expect(r.scene.findAll((n) => n.instance.userData?.placementId !== undefined)).toHaveLength(0);
  });
});
