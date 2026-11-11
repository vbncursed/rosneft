import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial } from "three";
import { pointOnTexture, pointsOnTexture } from "./texture-surface";

function triangle() {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 0, 2], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  return new Mesh(geometry, new MeshBasicMaterial());
}

describe("pointOnTexture", () => {
  it("maps a batch of UV points on indexed geometry", () => {
    const mesh = triangle();
    mesh.geometry.setIndex([0, 1, 2]);
    expect(
      pointsOnTexture(mesh, [
        { x: 0.25, y: 0.25 },
        { x: 0.8, y: 0.8 },
      ]),
    ).toEqual([{ x: 0.5, y: 0, z: 0.5 }, null]);
  });
  it("interpolates triangle positions in world coordinates", () => {
    const mesh = triangle();
    mesh.applyMatrix4(new Matrix4().makeTranslation(3, 2, 4));
    mesh.updateMatrixWorld();
    expect(pointOnTexture(mesh, 0.25, 0.25)).toEqual({ x: 3.5, y: 2, z: 4.5 });
  });
  it("rejects a point outside the texture triangles", () => {
    expect(pointOnTexture(triangle(), 0.8, 0.8)).toBeNull();
  });
  it("rejects overlapping UV triangles mapping to different locations", () => {
    const mesh = triangle();
    mesh.geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 0, 2, 10, 0, 0, 12, 0, 0, 10, 0, 2], 3),
    );
    mesh.geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 2));
    expect(pointOnTexture(mesh, 0.25, 0.25)).toBeNull();
  });
});
