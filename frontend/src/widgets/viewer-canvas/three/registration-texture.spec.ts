import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Texture } from "three";
import { findRegistrationMesh } from "./registration-texture";

function mesh(texture: Texture | null) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  return new Mesh(geometry, new MeshBasicMaterial({ map: texture }));
}

describe("findRegistrationMesh", () => {
  it("selects a single UV mapped textured mesh", () => {
    const root = new Group(),
      model = mesh(new Texture());
    root.add(model);
    expect(findRegistrationMesh(root)).toBe(model);
  });
  it("rejects transformed texture coordinates", () => {
    const texture = new Texture();
    texture.offset.set(0.2, 0);
    const root = new Group();
    root.add(mesh(texture));
    expect(findRegistrationMesh(root)).toBeNull();
  });
  it("rejects an untextured or ambiguous multi-mesh model", () => {
    const root = new Group();
    root.add(mesh(null));
    expect(findRegistrationMesh(root)).toBeNull();
    root.clear();
    root.add(mesh(new Texture()), mesh(new Texture()));
    expect(findRegistrationMesh(root)).toBeNull();
  });
});
