import { BoxGeometry, Group, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
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

  // A broken GLB can carry non-finite positions; a sphere of infinite or NaN
  // radius would read as "fills the screen" and fetch the finest level.
  const withVertices = (...xs: number[]) => {
    const geometry = new BoxGeometry(1, 1, 1);
    xs.forEach((x, i) => geometry.attributes.position.setX(i, x));
    return new Mesh(geometry);
  };

  it("is null when a vertex sits at infinity", () => {
    expect(boundsOf(withVertices(Infinity))).toBeNull();
  });

  it("is null when a vertex is NaN", () => {
    // three reports the NaN bounding box on console.error; that is its
    // diagnostic, not this spec's output.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(boundsOf(withVertices(NaN))).toBeNull();
    } finally {
      quiet.mockRestore();
    }
  });

  // Both cases above already end as NaN: the world transform multiplies the
  // infinite coordinate by 0. A radius of Infinity takes finite corners whose
  // squared length overflows — here, a scale no real scene has.
  it("is null when the world size overflows a number", () => {
    const mesh = withVertices();
    mesh.scale.setScalar(1e200);
    expect(boundsOf(mesh)).toBeNull();
  });
});
