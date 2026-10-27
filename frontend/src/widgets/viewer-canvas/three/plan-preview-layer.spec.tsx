import { screen } from "@testing-library/react";
import { LineLoop, LineSegments, Mesh, Raycaster, Vector3, type Group, type MeshBasicMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewOutline } from "@/features/zone-editor";
import type { PlanPreview } from "../ui/props";
import PlanPreviewLayer from "./plan-preview-layer";
import { createInPage, unmountInPage } from "./testing";

afterEach(unmountInPage);

const outline = (index: number, x: number): PreviewOutline => ({
  index,
  corners: [
    { x, y: 3, z: 0 },
    { x: x + 1, y: 3, z: 0 },
    { x: x + 1, y: 3, z: 1 },
    { x, y: 3, z: 1 },
  ],
});
const OUTLINES = [outline(4, 0), outline(7, 5), outline(9, 10)];

const layer = (over: Partial<PlanPreview> = {}, interactive = true) => (
  <PlanPreviewLayer
    preview={{ outlines: OUTLINES, selected: null, label: null, onSelect: vi.fn(), ...over }}
    unitRatio={50}
    color="#f97316"
    interactive={interactive}
  />
);

type Page = Awaited<ReturnType<typeof createInPage>>;
const root = (r: Page) => r.scene.findAll((n) => n.instance.name === "PlanPreviewLayer")[0].instance as Group;
const feet = (r: Page) =>
  r.scene.findAll((n) => n.instance.type === "Mesh" && n.instance.name === "PlanPreviewFeet")[0];
const ray = (r: Page, x: number) => {
  root(r).updateMatrixWorld(true);
  return new Raycaster(new Vector3(x, 10, 0.5), new Vector3(0, -1, 0)).intersectObject(root(r), true);
};
const click = (x: number, z = 0.5) => ({ stopPropagation: vi.fn(), faceIndex: 0, point: { x, y: 3, z } });

describe("PlanPreviewLayer", () => {
  it("draws all outlines as one merged line geometry and one merged footprint mesh", async () => {
    const r = await createInPage(layer());
    const lines = r.scene.findAll((n) => n.instance instanceof LineSegments);
    expect(lines).toHaveLength(1);
    expect((lines[0].instance as LineSegments).geometry.getAttribute("position").count).toBe(24);
    expect(r.scene.findAll((n) => n.instance.type === "Mesh")).toHaveLength(1);
  });

  it("is a see-through accent line that writes no depth and paints over the plan and the zones", async () => {
    const r = await createInPage(layer());
    const line = r.scene.findAll((n) => n.instance instanceof LineSegments)[0].instance as LineSegments;
    const m = line.material as MeshBasicMaterial;
    expect([m.transparent, m.depthWrite, m.opacity]).toEqual([true, false, 0.7]);
    expect(m.color.getHexString()).toBe("f97316");
    expect(line.renderOrder).toBeGreaterThan(0);
    const mesh = feet(r).instance as Mesh;
    expect((mesh.material as MeshBasicMaterial).depthWrite).toBe(false);
    expect(mesh.renderOrder).toBeGreaterThan(0);
  });

  it("lies below a zone's lift, so a saved zone is hit first by a ray from above", async () => {
    const r = await createInPage(layer());
    expect(root(r).position.y).toBeGreaterThan(0);
    expect(root(r).position.y).toBeLessThan(0.1 / 50);
  });

  it("draws the picked rectangle emphasised and names it, and only that one", async () => {
    const r = await createInPage(layer({ selected: 7, label: "Rectangle 7.5 × 13.0 m" }));
    expect(r.scene.findAll((n) => n.instance instanceof LineLoop)).toHaveLength(1);
    expect(screen.getAllByText("Rectangle 7.5 × 13.0 m")).toHaveLength(1);
  });

  it("draws no emphasis and no label while nothing is picked", async () => {
    const r = await createInPage(layer({ label: "Rectangle 7.5 × 13.0 m" }));
    expect(r.scene.findAll((n) => n.instance instanceof LineLoop)).toHaveLength(0);
    expect(screen.queryByText("Rectangle 7.5 × 13.0 m")).toBeNull();
  });

  it("selects the rectangle under the clicked triangle, by its editor index", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }));
    await r.fireEvent(feet(r), "click", click(5.5));
    expect(onSelect).toHaveBeenCalledWith(7);
    await r.fireEvent(feet(r), "click", click(10.5));
    expect(onSelect).toHaveBeenLastCalledWith(9);
  });

  it("selects the inner of two nested rectangles under the point, and the outer one elsewhere", async () => {
    const onSelect = vi.fn();
    const nested = [
      outline(1, 0),
      { index: 8, corners: outline(8, 0.25).corners.map((c) => ({ ...c, z: c.z * 0.5 + 0.25, x: c.x + 0.1 })) },
    ];
    const r = await createInPage(layer({ onSelect, outlines: nested as PreviewOutline[] }));
    await r.fireEvent(feet(r), "click", click(0.6, 0.5));
    expect(onSelect).toHaveBeenLastCalledWith(8);
    await r.fireEvent(feet(r), "click", click(0.1, 0.9));
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });

  it("answers no click and no ray when not interactive", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }, false));
    await r.fireEvent(feet(r), "click", click(0.5));
    expect(onSelect).not.toHaveBeenCalled();
    expect(ray(r, 0.5)).toHaveLength(0);
  });

  it("is hit by a ray, and selects again, after a stretch of non-interactive modes without a remount", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }));
    await r.update(layer({ onSelect }, false));
    await r.update(layer({ onSelect }, true));
    expect(ray(r, 5.5).length).toBeGreaterThan(0);
    await r.fireEvent(feet(r), "click", click(5.5));
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it("builds new geometry only when the outlines change", async () => {
    const r = await createInPage(layer());
    const geo = (feet(r).instance as Mesh).geometry;
    await r.update(layer({ selected: 4 }));
    expect((feet(r).instance as Mesh).geometry).toBe(geo);
    await r.update(layer({ outlines: [OUTLINES[0]] }));
    expect((feet(r).instance as Mesh).geometry).not.toBe(geo);
  });
});
