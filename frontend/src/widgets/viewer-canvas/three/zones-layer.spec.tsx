import { screen } from "@testing-library/react";
import { Mesh, Raycaster, Vector3, type Group, type MeshBasicMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";
import { createInPage, unmountInPage } from "./testing";
import ZonesLayer from "./zones-layer";

afterEach(unmountInPage);

const TANKS = { slug: "tanks", title: "Tanks" };
const zone = (id: number, title: string, x = 0): Zone => ({
  id,
  title,
  corners: [
    { x, y: 3, z: 0 },
    { x: x + 1, y: 3, z: 0 },
    { x: x + 1, y: 3, z: 1 },
    { x, y: 3, z: 1 },
  ],
  tags: [TANKS],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
});

const layer = (over: Partial<Parameters<typeof ZonesLayer>[0]> = {}) => (
  <ZonesLayer
    zones={[zone(1, "Tank row"), zone(2, "Loading rack", 5)]}
    unitRatio={50}
    color="#f97316"
    interactive
    selectedId={null}
    onSelect={vi.fn()}
    {...over}
  />
);

const meshes = (r: Awaited<ReturnType<typeof createInPage>>) => r.scene.findAll((n) => n.instance.type === "Mesh");
const materialOf = (node: { instance: unknown }) => (node.instance as Mesh).material as MeshBasicMaterial;
const clickEvent = () => ({ stopPropagation: vi.fn() });

describe("ZonesLayer", () => {
  it("draws each zone as a transparent fill that writes no depth, so it never hides the ground or a placement", async () => {
    const r = await createInPage(layer());
    expect(meshes(r)).toHaveLength(2);
    for (const node of meshes(r)) {
      expect(materialOf(node).transparent).toBe(true);
      expect(materialOf(node).depthWrite).toBe(false);
      expect(materialOf(node).opacity).toBeCloseTo(0.25, 10);
      expect(materialOf(node).color.getHexString()).toBe("f97316");
    }
  });

  it("outlines each zone with a line loop", async () => {
    const r = await createInPage(layer());
    expect(r.scene.findAll((n) => n.instance.type === "LineLoop")).toHaveLength(2);
  });

  it("lifts the layer 0.1 m clear of the ground, in scene units", async () => {
    const r = await createInPage(layer({ unitRatio: 50 }));
    const root = r.scene.findAll((n) => n.instance.name === "ZonesLayer")[0].instance as Group;
    expect(root.position.y).toBeCloseTo(0.1 / 50, 10);
  });

  it("titles each zone with a label the page can query", async () => {
    await createInPage(layer());
    expect(screen.getByText("Tank row")).toBeInTheDocument();
    expect(screen.getByText("Loading rack")).toBeInTheDocument();
  });

  it("selects a zone on click when interactive", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }));
    await r.fireEvent(meshes(r)[1], "click", clickEvent());
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("answers no click and offers nothing to a raycast when not interactive", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect, interactive: false }));
    await r.fireEvent(meshes(r)[0], "click", clickEvent());
    expect(onSelect).not.toHaveBeenCalled();
    expect((meshes(r)[0].instance as Mesh).raycast).not.toBe(Mesh.prototype.raycast);

    // A measure or place ray straight down through a zone must find nothing.
    const root = r.scene.findAll((n) => n.instance.name === "ZonesLayer")[0].instance;
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.5, 10, 0.5), new Vector3(0, -1, 0));
    expect(ray.intersectObject(root, true)).toHaveLength(0);
  });

  it("is hit by a ray and selects again after a stretch of non-interactive modes, without a remount", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }));
    await r.update(layer({ onSelect, interactive: false }));
    await r.update(layer({ onSelect, interactive: true }));
    const root = r.scene.findAll((n) => n.instance.name === "ZonesLayer")[0].instance;
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.5, 10, 0.5), new Vector3(0, -1, 0));
    expect(ray.intersectObject(root, true).length).toBeGreaterThan(0);
    await r.fireEvent(meshes(r)[0], "click", clickEvent());
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("is hit by a ray while interactive", async () => {
    const r = await createInPage(layer());
    const root = r.scene.findAll((n) => n.instance.name === "ZonesLayer")[0].instance;
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.5, 10, 0.5), new Vector3(0, -1, 0));
    expect(ray.intersectObject(root, true).length).toBeGreaterThan(0);
  });

  it("draws the selected zone stronger than the others", async () => {
    const r = await createInPage(layer({ selectedId: 2 }));
    expect(materialOf(meshes(r)[0]).opacity).toBeLessThan(materialOf(meshes(r)[1]).opacity);
  });

  it("draws nothing for no zones", async () => {
    const r = await createInPage(layer({ zones: [] }));
    expect(meshes(r)).toHaveLength(0);
  });
});
