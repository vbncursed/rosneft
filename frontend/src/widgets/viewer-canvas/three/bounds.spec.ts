import { BoxGeometry, Group, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { boundsOf } from "./bounds";

describe("boundsOf", () => {
  it("is the world sphere around the object's meshes", () => {
    const g = new Group();
    g.position.set(3, 0, 0);
    g.add(new Mesh(new BoxGeometry(1, 1, 1)));
    g.updateMatrixWorld(true);
    const s = boundsOf(g)!;
    expect(s.center.x).toBeCloseTo(3);
    expect(s.radius).toBeCloseTo(Math.sqrt(3) / 2);
  });

  it("is null for nothing, and for an object with no size yet", () => {
    expect(boundsOf(null)).toBeNull();
    expect(boundsOf(new Group())).toBeNull();
  });
});
