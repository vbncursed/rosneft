import { describe, expect, it } from "vitest";
import { autoLod, orderByPreferred, pickCoarsest, pickLod, projectedArea, selectProgressive } from "./lod";

const chain = [
  { lod: 0, hash: "a", size: 30 },
  { lod: 1, hash: "b", size: 20 },
  { lod: 2, hash: "c", size: 10 },
];

describe("lod chain", () => {
  it("orders by closeness to the preferred level, ties toward quality", () => {
    expect(orderByPreferred(chain, 1).map((a) => a.lod)).toEqual([1, 0, 2]);
  });

  it("picks the requested level or the closest one", () => {
    expect(pickLod(chain, 2)?.hash).toBe("c");
    expect(pickLod(chain, 5)?.hash).toBe("c");
    expect(pickLod([], 0)).toBeNull();
  });

  it("names the coarsest level", () => {
    expect(pickCoarsest(chain)?.lod).toBe(2);
    expect(pickCoarsest([])).toBeNull();
  });

  it("shows the coarsest and warms the target until ready", () => {
    expect(selectProgressive(chain, 0, false)).toEqual({ show: chain[2], warm: chain[0] });
    expect(selectProgressive(chain, 0, true)).toEqual({ show: chain[0], warm: null });
    expect(selectProgressive(chain, 2, false)).toEqual({ show: chain[2], warm: null });
    expect(selectProgressive([chain[0]], 0, false)).toEqual({ show: chain[0], warm: null });
  });

  it("keeps a held level on screen while the finer target warms, and shows the target once ready", () => {
    expect(selectProgressive(chain, 0, false, chain[1])).toEqual({ show: chain[1], warm: chain[0] });
    expect(selectProgressive(chain, 0, true, chain[1])).toEqual({ show: chain[0], warm: null });
  });

  it("falls back to the coarsest when nothing is held, the held level left the chain, or it is the target", () => {
    expect(selectProgressive(chain, 0, false, null)).toEqual({ show: chain[2], warm: chain[0] });
    expect(selectProgressive([chain[0], chain[2]], 0, false, chain[1])).toEqual({ show: chain[2], warm: chain[0] });
    expect(selectProgressive(chain, 0, false, chain[0])).toEqual({ show: chain[2], warm: chain[0] });
  });
});

describe("projectedArea", () => {
  it("is the projected circle of the sphere, in drawing-buffer pixels", () => {
    // tan(90° / 2) = 1, so the radius spans 1 / 2 of the half-height: 25 px.
    expect(projectedArea({ radius: 1, distance: 2, fovDeg: 90, heightPx: 100 })).toBeCloseTo(Math.PI * 625);
  });

  it("counts a denser screen's real pixels", () => {
    const at1 = projectedArea({ radius: 1, distance: 2, fovDeg: 90, heightPx: 100 });
    const at2 = projectedArea({ radius: 1, distance: 2, fovDeg: 90, heightPx: 200 });
    expect(at2 / at1).toBeCloseTo(4);
  });

  it("is unbounded with the camera inside the sphere", () => {
    expect(projectedArea({ radius: 1, distance: 0.5, fovDeg: 50, heightPx: 900 })).toBe(Infinity);
    expect(projectedArea({ radius: 1, distance: 1, fovDeg: 50, heightPx: 900 })).toBe(Infinity);
  });
});

describe("autoLod", () => {
  // dji-wp46-cut as converted on dev: 1.82 M / 911 k / 455 k faces.
  const DJI = [
    { lod: 0, hash: "a", size: 15_000_000, faces: 1_822_382 },
    { lod: 1, hash: "b", size: 7_400_000, faces: 911_117 },
    { lod: 2, hash: "c", size: 3_600_000, faces: 455_435 },
  ];
  // Framed whole on a 1600×900 canvas at dpr 1.5, the fitted sphere spans
  // about 562 px of radius (spec §1).
  const framed = Math.PI * 562 ** 2;

  it("keeps a territory framed whole on its coarsest level", () => {
    expect(autoLod(DJI, framed)).toBe(2);
  });

  it("steps to LOD 1 about 1.5× closer and to LOD 0 about 2× closer", () => {
    expect(autoLod(DJI, framed * 1.5 ** 2)).toBe(1);
    expect(autoLod(DJI, framed * 2 ** 2)).toBe(0);
  });

  it("takes the finest level when none is dense enough, or the camera is inside", () => {
    expect(autoLod(DJI, 1e12)).toBe(0);
    expect(autoLod(DJI, Infinity)).toBe(0);
  });

  it("takes the finest level when any level lacks a face count — today's behaviour, not a guess", () => {
    expect(autoLod([{ ...DJI[0] }, { lod: 2, hash: "c", size: 1 }], 1)).toBe(0);
    expect(autoLod([{ ...DJI[0] }, { ...DJI[2], faces: 0 }], 1)).toBe(0);
  });

  it("answers the only level of a one-level chain, and null for an empty one", () => {
    expect(autoLod([DJI[2]], 1e12)).toBe(2);
    expect(autoLod([], 100)).toBeNull();
  });

  it("honours a custom density", () => {
    expect(autoLod(DJI, framed, 1)).toBe(0);
  });
});
