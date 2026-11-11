import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial } from "three";
import { registrationGeometry } from "./registration-geometry";

describe("registrationGeometry", () => {
  it("copies geometry so a worker can receive it without detaching the viewer", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
    geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    geometry.setIndex([0, 1, 2]);
    const snapshot = registrationGeometry(new Mesh(geometry, new MeshBasicMaterial()));
    expect(snapshot?.indices).toEqual(new Uint16Array([0, 1, 2]));
    expect(snapshot?.positions).not.toBe(geometry.getAttribute("position").array);
  });
});
