import { describe, expect, it } from "vitest";

import { sceneScale, utmToScene, type SourceBbox } from "./utm-to-scene";

// 200 m across in x and z, 100 m tall: the largest axis is 200, so scale = 2/200.
const BBOX: SourceBbox = {
  min: { x: 499900, y: -50, z: -100 },
  max: { x: 500100, y: 50, z: 100 },
};

describe("utmToScene", () => {
  it("maps the footprint centre to the scene origin", () => {
    const p = utmToScene(500000, 0, BBOX);
    expect(p?.x).toBeCloseTo(0, 12);
    expect(p?.z).toBeCloseTo(0, 12);
  });

  it("negates the northing: north is -z", () => {
    expect(utmToScene(500000, 50, BBOX)?.z).toBeCloseTo(-0.5, 12);
    expect(utmToScene(500050, 0, BBOX)?.x).toBeCloseTo(0.5, 12);
  });

  it("returns null outside the footprint", () => {
    expect(utmToScene(500101, 0, BBOX)).toBeNull();
    expect(utmToScene(500000, 101, BBOX)).toBeNull();
  });

  it("returns null for a degenerate bbox", () => {
    const flat: SourceBbox = { min: { x: 5, y: 0, z: 0 }, max: { x: 5, y: 0, z: 0 } };
    expect(utmToScene(5, 0, flat)).toBeNull();
  });
});

describe("sceneScale", () => {
  it("is 2 over the largest axis, null when empty", () => {
    expect(sceneScale(BBOX)).toBe(0.01);
    expect(sceneScale({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } })).toBeNull();
  });
});
