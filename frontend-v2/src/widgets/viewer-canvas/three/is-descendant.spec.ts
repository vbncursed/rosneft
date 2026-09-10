import { Group, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { isDescendant } from "./is-descendant";

describe("isDescendant", () => {
  it("counts a node as its own subtree root", () => {
    const root = new Group();
    expect(isDescendant(root, root)).toBe(true);
  });

  it("follows the chain of parents", () => {
    const root = new Group();
    const child = new Group();
    const grandchild = new Object3D();
    root.add(child);
    child.add(grandchild);
    expect(isDescendant(grandchild, root)).toBe(true);
  });

  it("refuses an unrelated node", () => {
    expect(isDescendant(new Object3D(), new Group())).toBe(false);
  });

  it("refuses a miss — a ray that hit nothing is not in the subtree", () => {
    expect(isDescendant(null, new Group())).toBe(false);
  });
});
