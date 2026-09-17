import ReactThreeTestRenderer from "@react-three/test-renderer";
import { BackSide, Raycaster, RepeatWrapping, SRGBColorSpace, Texture, type Mesh, type MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
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

// jsdom has no ImageBitmap; three only ever hands it to the GL upload, which
// never runs here, so the close() the sphere owes it is the whole contract.
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

const mount = (over: { bitmap?: ImageBitmap; opacity?: number } = {}) =>
  ReactThreeTestRenderer.create(
    <PanoramaSphere panorama={PANO} bitmap={over.bitmap ?? bitmap()} opacity={over.opacity} />,
  );

describe("PanoramaSphere", () => {
  it("is an inverted 50-unit sphere at the anchor, turned by the yaw offset, drawn from the inside without tone mapping", async () => {
    const r = await mount();
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

  it("maps the bitmap for the inside of the sphere: sRGB, pre-flipped, U reversed", async () => {
    // three imports nowhere near the feature hook any more (it would ride in
    // every page's bundle); the texture is built here, from the bitmap.
    const r = await mount();
    const texture = (r.scene.children[0].instance as Mesh & { material: MeshBasicMaterial }).material
      .map as Texture;
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    // The bitmap arrives pre-flipped, and WebGL cannot flip one itself.
    expect(texture.flipY).toBe(false);
    // U reversed so the photo is not mirrored on a BackSide sphere.
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.repeat.x).toBe(-1);
    expect(texture.offset.x).toBe(1);
    // `needsUpdate` is a write-only setter that bumps the version; without it
    // three never uploads the image and the sphere renders untextured.
    expect(texture.version).toBeGreaterThan(0);
  });

  it("ghosts for calibration: transparent, no depth, drawn last", async () => {
    const r = await mount({ opacity: 0.5 });
    const mesh = r.scene.children[0].instance as Mesh;
    const mat = mesh.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBe(0.5);
    expect(mat.depthTest).toBe(false);
    expect(mat.depthWrite).toBe(false);
    expect(mesh.renderOrder).toBe(1000);
  });

  it("rebuilds the shader when the photo starts and stops ghosting", async () => {
    // three bakes `#define OPAQUE` — which hard-sets the fragment's alpha to
    // 1.0 — into the program it compiles while `transparent` is false, and
    // `transparent` is not one of the properties `setProgram` re-checks per
    // frame. So the slider set `opacity` on a material whose shader threw it
    // away: blending was on, the source alpha was 1, and the photo painted
    // fully opaque at every setting. `needsUpdate` bumps `material.version`,
    // which is the one thing three does re-check.
    const r = await mount({ opacity: 1 });
    const mesh = r.scene.children[0].instance as Mesh;
    const mat = mesh.material as MeshBasicMaterial;
    const opaqueVersion = mat.version;

    await r.update(<PanoramaSphere panorama={PANO} bitmap={bitmap()} opacity={0.5} />);
    const ghostVersion = mat.version;
    expect(ghostVersion).toBeGreaterThan(opaqueVersion);

    // And back: the opaque program is the one that skips blending entirely.
    await r.update(<PanoramaSphere panorama={PANO} bitmap={bitmap()} opacity={1} />);
    expect(mat.version).toBeGreaterThan(ghostVersion);
  });

  it("cannot be hit by the pointer — a click into the sky reaches onPointerMissed", async () => {
    const r = await mount();
    const mesh = r.scene.children[0].instance as Mesh;
    const hits: unknown[] = [];
    mesh.raycast(new Raycaster(), hits as never);
    expect(hits).toEqual([]);
  });

  it("hands the prototype raycast back when the panorama closes", async () => {
    const r = await mount();
    const mesh = r.scene.children[0].instance as Mesh;
    await r.unmount();
    expect(mesh.raycast).toBe((Object.getPrototypeOf(mesh) as Mesh).raycast);
  });

  it("frees the GL texture when the panorama closes, and leaves the bitmap to the hook that downloaded it", async () => {
    // This cleanup also runs on StrictMode's dev remount, and a closed
    // ImageBitmap cannot be uploaded again: closing it here rendered the
    // sphere black in dev and nowhere else. `usePanoramaTexture` owns it.
    const first = bitmap();
    const dispose = vi.spyOn(Texture.prototype, "dispose");
    const r = await mount({ bitmap: first });
    await r.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(first.close).not.toHaveBeenCalled();
    dispose.mockRestore();
  });

  it("frees the previous capture's texture when the reader moves to the next one", async () => {
    const first = bitmap();
    const second = bitmap();
    const dispose = vi.spyOn(Texture.prototype, "dispose");
    const r = await mount({ bitmap: first });

    await r.update(<PanoramaSphere panorama={PANO} bitmap={second} />);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(first.close).not.toHaveBeenCalled();
    dispose.mockRestore();
  });
});
