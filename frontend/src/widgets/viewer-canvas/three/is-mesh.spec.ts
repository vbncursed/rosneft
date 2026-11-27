import { Group, Mesh, SkinnedMesh } from "three";
import { expect, it } from "vitest";
import { isMesh } from "./is-mesh";

it("recognizes meshes and their subclasses during scene traversal", () => {
  expect(isMesh(new Mesh())).toBe(true);
  expect(isMesh(new SkinnedMesh())).toBe(true);
  expect(isMesh(new Group())).toBe(false);
});
