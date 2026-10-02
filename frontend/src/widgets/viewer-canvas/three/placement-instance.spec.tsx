import ReactThreeTestRenderer from "@react-three/test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LodArtifact } from "@/entities/scene";
import { AutoLodClock } from "./auto-lod-clock";
import PlacementInstance from "./placement-instance";
import { eventually, fakePlacement, waitInAct } from "./testing";

vi.mock("@react-three/drei", async (orig) => (await import("./testing")).mockDrei(orig));

const withChain = (chain: LodArtifact[]) => ({
  ...fakePlacement(7),
  chain,
});

// Every renderer a test made, unmounted after it: a live one keeps warming
// its target and calling useGLTF into whichever test runs next.
const mounted: { unmount: () => Promise<void> }[] = [];
// Under the scene's one settle clock, as SceneCanvas mounts it.
const create = async (...[element, options]: Parameters<typeof ReactThreeTestRenderer.create>) => {
  const r = await ReactThreeTestRenderer.create(<AutoLodClock>{element}</AutoLodClock>, options);
  mounted.push(r);
  return r;
};

describe("PlacementInstance", () => {
  afterEach(async () => {
    for (const r of mounted.splice(0)) await r.unmount();
  });

  it("stamps the placement id and applies its transform to the group", async () => {
    const placement = fakePlacement(4);
    placement.rotation = { x: 0, y: 1, z: 0 };
    placement.scale = { x: 2, y: 2, z: 2 };
    const r = await create(
      <PlacementInstance placement={placement} measureMode={false} measuring={false} onSelect={vi.fn()} />,
    );
    const group = r.scene.findAll((n) => n.instance.userData?.placementId === 4)[0];
    expect(group.instance.position.x).toBe(4);
    expect(group.instance.rotation.y).toBe(1);
    expect(group.instance.scale.x).toBe(2);
  });

  it("shows the coarsest level first and warms the target behind it", async () => {
    const drei = await import("@react-three/drei");
    vi.mocked(drei.useGLTF).mockClear();
    await create(
      <PlacementInstance
        placement={withChain([
          { lod: 0, hash: "fine", size: 90 },
          { lod: 2, hash: "coarse", size: 10 },
        ])}
        measureMode={false}
        measuring={false}
        onSelect={vi.fn()}
      />,
    );
    const urls = () => vi.mocked(drei.useGLTF).mock.calls.map((c) => c[0]);
    expect(urls()[0]).toContain("coarse");
    // A chain with no face counts: Auto answers LOD 0 after the settle, as the
    // hard-coded target did.
    await eventually(() => expect(urls()).toContain("/api/assets/fine"));
  });

  it("stays on the coarse level while it is small on screen", async () => {
    const drei = await import("@react-three/drei");
    const { SETTLE_MS } = await import("./use-auto-lod");
    vi.mocked(drei.useGLTF).mockClear();
    await create(
      <PlacementInstance
        placement={withChain([
          { lod: 0, hash: "fine", size: 90, faces: 2_000_000 },
          { lod: 2, hash: "coarse", size: 10, faces: 1_000_000 },
        ])}
        measureMode={false}
        measuring={false}
        onSelect={vi.fn()}
      />,
    );
    await waitInAct(SETTLE_MS + 60);
    const urls = vi.mocked(drei.useGLTF).mock.calls.map((c) => String(c[0]));
    expect(urls).not.toContain("/api/assets/fine");
    expect(urls.every((u) => u.endsWith("coarse"))).toBe(true);
  });

  it("pulls LOD 0 while measuring, though it is small on screen", async () => {
    // The same chain that stays coarse above: a ruler point lands on the mesh
    // drawn, so measuring asks for the finest level Auto would not.
    const drei = await import("@react-three/drei");
    vi.mocked(drei.useGLTF).mockClear();
    await create(
      <PlacementInstance
        placement={withChain([
          { lod: 0, hash: "fine", size: 90, faces: 2_000_000 },
          { lod: 2, hash: "coarse", size: 10, faces: 1_000_000 },
        ])}
        measureMode
        measuring
        onSelect={vi.fn()}
      />,
    );
    await eventually(() => expect(vi.mocked(drei.useGLTF).mock.calls.map((c) => c[0])).toContain("/api/assets/fine"));
  });

  it("drops a level that throws and shows the next one, with no error card", async () => {
    // The old ladder, and the right answer for a placement: one broken asset
    // among many must not blank the scene the way a broken territory does.
    // Not mockImplementationOnce — React retries a failed render synchronously
    // and, if the retry succeeds, never reaches the boundary at all.
    const drei = await import("@react-three/drei");
    const { fakeScene } = await import("./testing");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", swallow);
    vi.mocked(drei.useGLTF).mockImplementation((url) => {
      if (String(url).includes("coarse")) throw new Error("bad glb");
      return { scene: fakeScene() } as never;
    });

    const r = await create(
      <PlacementInstance
        placement={withChain([
          { lod: 0, hash: "fine", size: 90 },
          { lod: 2, hash: "coarse", size: 10 },
        ])}
        measureMode={false}
        measuring={false}
        onSelect={vi.fn()}
      />,
    );

    // The coarse level went; LOD 0 is what mounted, and the instance is on
    // screen rather than gone.
    await eventually(() => expect(vi.mocked(drei.useGLTF).mock.calls.map((c) => c[0])).toContain("/api/assets/fine"));
    expect(r.scene.findAll((n) => n.instance.userData?.placementId === 7)).toHaveLength(1);

    window.removeEventListener("error", swallow);
    quiet.mockRestore();
    vi.mocked(drei.useGLTF).mockReset();
  });

  it("renders nothing for a model that has not been converted", async () => {
    const r = await create(
      <PlacementInstance placement={withChain([])} measureMode={false} measuring={false} onSelect={vi.fn()} />,
    );
    expect(r.scene.findAll((n) => n.instance.userData?.placementId !== undefined)).toHaveLength(0);
  });

  it("shows a pointer over an object that a click would select, and not while measuring", async () => {
    const hover = async (measureMode: boolean) => {
      const r = await create(
        <PlacementInstance
          placement={fakePlacement(5)}
          measureMode={measureMode}
          measuring={false}
          onSelect={vi.fn()}
        />,
      );
      const group = r.scene.findAll((n) => n.instance.userData?.placementId === 5)[0];
      await r.fireEvent(group, "onPointerOver", { stopPropagation: vi.fn() });
      const cursor = document.body.style.cursor;
      await r.fireEvent(group, "onPointerOut", { stopPropagation: vi.fn() });
      const after = document.body.style.cursor;
      await r.unmount();
      return { cursor, after };
    };
    expect(await hover(false)).toEqual({ cursor: "pointer", after: "auto" });
    expect((await hover(true)).cursor).not.toBe("pointer");
  });
});
