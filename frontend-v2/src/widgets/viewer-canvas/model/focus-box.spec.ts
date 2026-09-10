import { BoxGeometry, Group, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { boxOf } from "./focus-box";

const instance = (id: number, x: number) => {
  const g = new Group();
  g.userData.placementId = id;
  g.position.x = x;
  g.add(new Mesh(new BoxGeometry(1, 1, 1)));
  return g;
};

describe("boxOf", () => {
  it("unions the boxes of the requested instances", () => {
    const root = new Group();
    root.add(instance(1, 0), instance(2, 10), instance(3, 50));
    const box = boxOf(root, [1, 2])!;
    expect(box.min.x).toBeCloseTo(-0.5);
    expect(box.max.x).toBeCloseTo(10.5);
  });

  it("is null when nothing matches", () => {
    expect(boxOf(new Group(), [9])).toBeNull();
  });
});
