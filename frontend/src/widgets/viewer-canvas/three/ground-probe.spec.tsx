import ReactThreeTestRenderer from "@react-three/test-renderer";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import GroundProbe, { type Ground } from "./ground-probe";

const box = (x0: number, x1: number, top: number) => {
  const m = new Mesh(new BoxGeometry(x1 - x0, 1, 4), new MeshBasicMaterial());
  m.position.set((x0 + x1) / 2, top - 0.5, 0);
  return m;
};
const terrain = (...meshes: Mesh[]) => {
  const g = new Group();
  g.add(...meshes);
  g.updateMatrixWorld(true);
  return g;
};

async function probe(root: Group | null) {
  const onReady = vi.fn<(g: Ground) => void>();
  const r = await ReactThreeTestRenderer.create(<GroundProbe root={{ current: root }} onReady={onReady} />);
  await r.advanceFrames(2, 0.016);
  return { onReady, r };
}

describe("GroundProbe", () => {
  it("answers the surface height under a point", async () => {
    const { onReady } = await probe(terrain(box(-2, 2, 5)));
    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady.mock.calls[0][0].groundAt(0.5, 0.5)).toBeCloseTo(5, 10);
  });

  it("answers null where the ray meets nothing", async () => {
    const { onReady } = await probe(terrain(box(-2, 2, 5)));
    expect(onReady.mock.calls[0][0].groundAt(40, 40)).toBeNull();
  });

  it("offers the median ground height as the fallback", async () => {
    // Three quarters of the footprint sits at 1, the last quarter at 3.
    const { onReady } = await probe(terrain(box(-2, 1, 1), box(1, 2, 3)));
    expect(onReady.mock.calls[0][0].fallbackY).toBeCloseTo(1, 10);
  });

  it("waits for a territory to be there, and says so once when it is", async () => {
    const holder: { current: Group | null } = { current: null };
    const onReady = vi.fn();
    const r = await ReactThreeTestRenderer.create(<GroundProbe root={holder} onReady={onReady} />);
    await r.advanceFrames(2, 0.016);
    expect(onReady).not.toHaveBeenCalled();

    holder.current = terrain(box(-2, 2, 5));
    await r.advanceFrames(3, 0.016);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("answers null when the territory is gone", async () => {
    const holder: { current: Group | null } = { current: terrain(box(-2, 2, 5)) };
    const onReady = vi.fn<(g: Ground) => void>();
    const r = await ReactThreeTestRenderer.create(<GroundProbe root={holder} onReady={onReady} />);
    await r.advanceFrames(1, 0.016);
    holder.current = null;
    expect(onReady.mock.calls[0][0].groundAt(0, 0)).toBeNull();
  });
});
