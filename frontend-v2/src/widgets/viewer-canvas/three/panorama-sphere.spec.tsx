import ReactThreeTestRenderer from "@react-three/test-renderer";
import { BackSide, Raycaster, Texture, type Mesh, type MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import PanoramaSphere from "./panorama-sphere";

const PANO = {
  id: 1,
  territorySlug: "t",
  slug: "s",
  title: "Control room",
  sourceBlobHash: "h",
  position: { x: 1, y: 2, z: 3 },
  yawOffset: 0.5,
  defaultYaw: 0,
  updatedAt: "",
};

describe("PanoramaSphere", () => {
  it("is an inverted 50-unit sphere at the anchor, turned by the yaw offset, drawn from the inside without tone mapping", async () => {
    const r = await ReactThreeTestRenderer.create(<PanoramaSphere panorama={PANO} texture={new Texture()} />);
    const mesh = r.scene.children[0].instance as Mesh;
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.rotation.y).toBeCloseTo(0.5);
    expect((mesh.geometry as unknown as { parameters: { radius: number } }).parameters.radius).toBe(50);
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.side).toBe(BackSide);
    expect(mat.toneMapped).toBe(false);
    expect(mat.transparent).toBe(false);
    expect(mesh.renderOrder).toBe(0);
  });

  it("ghosts for calibration: transparent, no depth, drawn last", async () => {
    const r = await ReactThreeTestRenderer.create(
      <PanoramaSphere panorama={PANO} texture={new Texture()} opacity={0.5} />,
    );
    const mesh = r.scene.children[0].instance as Mesh;
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(0.5);
    expect(mat.depthTest).toBe(false);
    expect(mat.depthWrite).toBe(false);
    expect(mesh.renderOrder).toBe(1000);
  });

  it("cannot be hit by the pointer — a click into the sky reaches onPointerMissed", async () => {
    const r = await ReactThreeTestRenderer.create(<PanoramaSphere panorama={PANO} texture={new Texture()} />);
    const mesh = r.scene.children[0].instance as Mesh;
    const hits: unknown[] = [];
    mesh.raycast(new Raycaster(), hits as never);
    expect(hits).toEqual([]);
  });

  it("hands the prototype raycast back when the panorama closes", async () => {
    const r = await ReactThreeTestRenderer.create(<PanoramaSphere panorama={PANO} texture={new Texture()} />);
    const mesh = r.scene.children[0].instance as Mesh;
    await r.unmount();
    expect(mesh.raycast).toBe((Object.getPrototypeOf(mesh) as Mesh).raycast);
  });
});
