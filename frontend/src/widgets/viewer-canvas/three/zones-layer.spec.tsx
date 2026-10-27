import { screen } from "@testing-library/react";
import { DoubleSide, Group, Mesh, Raycaster, Vector3, type LineSegments, type MeshBasicMaterial } from "three";
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

const faces = (r: Awaited<ReturnType<typeof createInPage>>) => r.scene.findAll((n) => n.instance.name === "ZoneFaces");
const picked = (r: Awaited<ReturnType<typeof createInPage>>) =>
  r.scene.findAll((n) => n.instance.name === "ZoneSelected");
const materialOf = (node: { instance: unknown }) => (node.instance as Mesh).material as MeshBasicMaterial;
const vertexCount = (node: { instance: unknown }) => (node.instance as Mesh).geometry.getAttribute("position").count;
const rootOf = (r: Awaited<ReturnType<typeof createInPage>>) =>
  r.scene.findAll((n) => n.instance.name === "ZonesLayer")[0].instance;
// The zones' faces are one merged mesh: the triangle a ray hits says which zone, ten to a zone.
const click = (over: object = {}) => ({ stopPropagation: vi.fn(), faceIndex: 0, intersections: [], ...over });

describe("ZonesLayer", () => {
  it("draws every zone as one translucent prism mesh that writes no depth, so it never hides the ground or a placement", async () => {
    const r = await createInPage(layer());
    expect(faces(r)).toHaveLength(1);
    // Eight vertices a zone: the footprint and the footprint raised.
    expect(vertexCount(faces(r)[0])).toBe(16);
    const material = materialOf(faces(r)[0]);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(DoubleSide);
    expect(material.opacity).toBeCloseTo(0.2, 10);
    expect(material.color.getHexString()).toBe("f97316");
  });

  it("raises each prism by the fixed 3 m, in scene units", async () => {
    const r = await createInPage(layer({ unitRatio: 50 }));
    const position = (faces(r)[0].instance as Mesh).geometry.getAttribute("position");
    // Zone 1's corner 0 stands at y 3; its raised copy is 3 m over it.
    expect(position.getY(0)).toBeCloseTo(3, 10);
    expect(position.getY(4)).toBeCloseTo(3 + 3 / 50, 5);
  });

  it("outlines the prisms with one merged set of line segments", async () => {
    const r = await createInPage(layer());
    const lines = r.scene.findAll((n) => n.instance.type === "LineSegments");
    expect(lines).toHaveLength(1);
    expect((lines[0].instance as LineSegments).geometry.getIndex()?.count).toBe(2 * 24);
  });

  it("lifts the layer 0.1 m clear of the ground, in scene units", async () => {
    const r = await createInPage(layer({ unitRatio: 50 }));
    expect((rootOf(r) as Group).position.y).toBeCloseTo(0.1 / 50, 10);
  });

  it("titles each zone with a label the page can query", async () => {
    await createInPage(layer());
    expect(screen.getByText("Tank row")).toBeInTheDocument();
    expect(screen.getByText("Loading rack")).toBeInTheDocument();
  });

  it("puts a zone's label at the middle of its top face", async () => {
    const r = await createInPage(layer({ unitRatio: 50, zones: [zone(1, "Tank row")] }));
    const labels = r.scene.findAll((n) => n.instance.type === "Group" && n.instance.position.y > 3);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0].instance.position.y).toBeCloseTo(3 + 3 / 50, 10);
  });

  it("selects the zone whose triangle was clicked, when interactive", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }));
    await r.fireEvent(faces(r)[0], "click", click({ faceIndex: 13 }));
    expect(onSelect).toHaveBeenCalledWith(2);
    await r.fireEvent(faces(r)[0], "click", click({ faceIndex: 4 }));
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });

  it("ignores a press that travelled: that was an orbit, not a click", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }));
    await r.fireEvent(faces(r)[0], "click", click({ delta: 12 }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("lets a placement inside the prism take the click", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }));
    const tank = new Group();
    tank.userData.placementId = 9;
    const hull = new Mesh();
    tank.add(hull);
    const zoneMesh = faces(r)[0].instance;
    const ev = click({
      object: zoneMesh,
      // Zone top at 5, the placement at 6, the zone's far side at 9: the tank stands inside it.
      intersections: [
        { object: zoneMesh, distance: 5 },
        { object: hull, distance: 6 },
        { object: zoneMesh, distance: 9 },
      ],
    });
    await r.fireEvent(faces(r)[0], "click", ev);
    expect(onSelect).not.toHaveBeenCalled();
    expect(ev.stopPropagation).not.toHaveBeenCalled();

    // The same tank far behind the zone does not take it.
    const behind = click({
      object: zoneMesh,
      intersections: [
        { object: zoneMesh, distance: 5 },
        { object: zoneMesh, distance: 9 },
        { object: hull, distance: 20 },
      ],
    });
    await r.fireEvent(faces(r)[0], "click", behind);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(behind.stopPropagation).toHaveBeenCalled();
  });

  it("answers no click and offers nothing to a raycast when not interactive", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect, interactive: false }));
    await r.fireEvent(faces(r)[0], "click", click());
    expect(onSelect).not.toHaveBeenCalled();
    expect((faces(r)[0].instance as Mesh).raycast).not.toBe(Mesh.prototype.raycast);

    // A measure or place ray straight down through a zone must find nothing.
    const root = rootOf(r);
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.5, 10, 0.5), new Vector3(0, -1, 0));
    expect(ray.intersectObject(root, true)).toHaveLength(0);
  });

  it("is hit by a ray and selects again after a stretch of non-interactive modes, without a remount", async () => {
    const onSelect = vi.fn();
    const r = await createInPage(layer({ onSelect }));
    await r.update(layer({ onSelect, interactive: false }));
    await r.update(layer({ onSelect, interactive: true }));
    const root = rootOf(r);
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.5, 10, 0.5), new Vector3(0, -1, 0));
    expect(ray.intersectObject(root, true).length).toBeGreaterThan(0);
    await r.fireEvent(faces(r)[0], "click", click());
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("is hit by a ray from a normal oblique orbit camera, through a side face, and not only from straight above", async () => {
    const r = await createInPage(layer({ unitRatio: 50 }));
    const root = rootOf(r);
    root.updateMatrixWorld(true);
    // 3 m is 0.06 units: this shallow ray meets the near wall of zone 1 (z 1) at height 3.03, never its top.
    const ray = new Raycaster(new Vector3(0.5, 3.13, 3), new Vector3(0, -0.05, -1).normalize());
    const hits = ray.intersectObject(root, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.z).toBeCloseTo(1, 1);
    expect(hits[0].point.y).toBeLessThan(3.06);
  });

  it("is hit by a ray while interactive", async () => {
    const r = await createInPage(layer());
    const root = rootOf(r);
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.5, 10, 0.5), new Vector3(0, -1, 0));
    expect(ray.intersectObject(root, true).length).toBeGreaterThan(0);
  });

  it("draws the selected zone stronger than the rest, as a prism of its own", async () => {
    const none = await createInPage(layer());
    expect(picked(none)).toHaveLength(0);
    const r = await createInPage(layer({ selectedId: 2 }));
    expect(picked(r)).toHaveLength(1);
    expect(vertexCount(picked(r)[0])).toBe(8);
    expect(materialOf(picked(r)[0]).opacity).toBeGreaterThan(materialOf(faces(r)[0]).opacity);
    expect(materialOf(picked(r)[0]).depthWrite).toBe(false);
  });

  it("makes the emphasis no target for a ray", async () => {
    const r = await createInPage(layer({ selectedId: 2 }));
    expect((picked(r)[0].instance as Mesh).raycast).not.toBe(Mesh.prototype.raycast);
  });

  it("draws nothing for no zones", async () => {
    const r = await createInPage(layer({ zones: [] }));
    expect(faces(r)).toHaveLength(0);
  });
});
