import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { applySurface } from "./snap-translate";

const SURFACE_Y = 0.5;
const territory = () => new Mesh(new BoxGeometry(10, 1, 10), new MeshBasicMaterial());

function at(x: number, y: number, z: number): Object3D {
  const o = new Object3D();
  o.position.set(x, y, z);
  return o;
}

describe("applySurface", () => {
  it("pulls the object down onto the surface with snap on", () => {
    const obj = at(0, 5, 0);
    expect(applySurface(obj, territory(), true)).toBe(true);
    expect(obj.position.y).toBe(SURFACE_Y);
  });

  it("lifts an object buried below the surface with snap on", () => {
    const obj = at(0, -20, 0);
    expect(applySurface(obj, territory(), true)).toBe(true);
    expect(obj.position.y).toBe(SURFACE_Y);
  });

  it("reports no change when the object already hugs the surface", () => {
    // The return value gates a re-render under frameloop="demand"; a false
    // positive here repaints on every drag tick.
    const obj = at(0, SURFACE_Y, 0);
    expect(applySurface(obj, territory(), false)).toBe(false);
    expect(applySurface(obj, territory(), true)).toBe(false);
  });

  it("lets the object hover with snap off", () => {
    const obj = at(0, 5, 0);
    expect(applySurface(obj, territory(), false)).toBe(false);
    expect(obj.position.y).toBe(5);
  });

  it("still refuses to bury the object with snap off", () => {
    const obj = at(0, -3, 0);
    expect(applySurface(obj, territory(), false)).toBe(true);
    expect(obj.position.y).toBe(SURFACE_Y);
  });

  it("leaves a drag past the edge of the territory where it is", () => {
    const obj = at(500, 5, 500);
    expect(applySurface(obj, territory(), true)).toBe(false);
    expect(obj.position.y).toBe(5);
  });
});
