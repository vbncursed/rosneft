import type { Mesh, MeshBasicMaterial } from "three";
import { afterEach, describe, expect, it } from "vitest";
import { applyFit, type Similarity } from "@/entities/site-plan";
import PlanOverlay, { type PlanFit } from "./plan-overlay";
import { createInPage, unmountInPage } from "./testing";

afterEach(unmountInPage);

// jsdom has no ImageBitmap, and nothing here uploads one to a GL context.
const image = { width: 4096, height: 2896, close: () => {} } as unknown as ImageBitmap;
const SIM: Similarity = { scale: 0.05, rotation: 0.3, tx: 12, tz: -7 };
const FIT: PlanFit = { similarity: SIM, page: { width: 1190, height: 842 } };

const overlay = (opacity = 1, fit = FIT) => <PlanOverlay image={image} fit={fit} groundY={4} opacity={opacity} />;
const meshOf = (r: Awaited<ReturnType<typeof createInPage>>) => r.scene.findAll((n) => n.instance.type === "Mesh")[0];
const materialOf = (r: Awaited<ReturnType<typeof createInPage>>) =>
  (meshOf(r).instance as Mesh).material as MeshBasicMaterial;

describe("PlanOverlay", () => {
  it("places the quad's corners where the fit puts the page's corners, at the ground height", async () => {
    const r = await createInPage(overlay());
    const position = (meshOf(r).instance as Mesh).geometry.getAttribute("position");
    const { width: w, height: h } = FIT.page;
    const corners = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    corners.forEach((c, i) => {
      const at = applyFit(SIM, c);
      expect(position.getX(i)).toBeCloseTo(at.x, 4);
      expect(position.getY(i)).toBeCloseTo(4, 10);
      expect(position.getZ(i)).toBeCloseTo(at.z, 4);
    });
  });

  it("maps the picture's top-left to the page's origin", async () => {
    const r = await createInPage(overlay());
    const uv = (meshOf(r).instance as Mesh).geometry.getAttribute("uv");
    expect([uv.getX(0), uv.getY(0), uv.getX(2), uv.getY(2)]).toEqual([0, 0, 1, 1]);
  });

  it("is opaque at full opacity, and never writes depth", async () => {
    const r = await createInPage(overlay(1));
    expect(materialOf(r).transparent).toBe(false);
    expect(materialOf(r).depthWrite).toBe(false);
  });

  it("recompiles the material when transparency flips, and only then", async () => {
    const r = await createInPage(overlay(1));
    const material = materialOf(r);
    const before = material.version;

    await r.update(overlay(0.5));
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeCloseTo(0.5, 10);
    expect(material.version).toBeGreaterThan(before);

    const flipped = material.version;
    await r.update(overlay(0.6));
    expect(material.opacity).toBeCloseTo(0.6, 10);
    expect(material.version).toBe(flipped);

    await r.update(overlay(1));
    expect(material.transparent).toBe(false);
    expect(material.version).toBeGreaterThan(flipped);
  });

  it("offers nothing to a raycast", async () => {
    const r = await createInPage(overlay());
    const hits: unknown[] = [];
    (meshOf(r).instance as Mesh).raycast({} as never, hits as never);
    expect(hits).toHaveLength(0);
  });

  it("hands the texture the picture, in sRGB, and lets it go on unmount", async () => {
    const r = await createInPage(overlay());
    const texture = materialOf(r).map!;
    expect(texture.image).toBe(image);
    expect(texture.colorSpace).toBe("srgb");
    let disposed = false;
    texture.addEventListener("dispose", () => (disposed = true));
    await r.unmount();
    expect(disposed).toBe(true);
  });
});
