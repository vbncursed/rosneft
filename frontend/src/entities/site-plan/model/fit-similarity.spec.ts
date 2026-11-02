import { describe, expect, it } from "vitest";

import { applyFit, fitSimilarity } from "./fit-similarity";

const MIRRORED =
  "These points are mirrored relative to the model. Check that each point on the plan is matched to the same spot on the model; the model expects x east and z south.";

// pdf (x, y down) -> scene (x, z): scale 0.002, rotated 30 degrees, shifted.
const TRUE = { scale: 0.002, rotation: Math.PI / 6, tx: 0.3, tz: -0.2 };
const PDF = [
  { x: 100, y: 200 },
  { x: 700, y: 150 },
  { x: 400, y: 900 },
  { x: 900, y: 800 },
];
const pair = (p: { x: number; y: number }, noise = 0) => {
  const s = applyFit(TRUE, p);
  return { pdf: p, scene: { x: s.x + noise, z: s.z - noise } };
};

describe("fitSimilarity", () => {
  it("fits two pairs exactly", () => {
    const r = fitSimilarity([pair(PDF[0]), pair(PDF[1])]);
    expect(r.ok && r.exact).toBe(true);
    if (!r.ok) return;
    expect(Math.max(...r.residuals)).toBeLessThan(1e-9);
    expect(r.fit.scale).toBeCloseTo(TRUE.scale, 12);
    expect(r.fit.rotation).toBeCloseTo(TRUE.rotation, 12);
    expect(r.fit.tx).toBeCloseTo(TRUE.tx, 12);
    expect(r.fit.tz).toBeCloseTo(TRUE.tz, 12);
  });

  it("fits three noisy pairs", () => {
    const noise = [0.0004, -0.0003, 0.0002];
    const r = fitSimilarity(PDF.slice(0, 3).map((p, i) => pair(p, noise[i])));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.exact).toBe(false);
    expect(Math.abs(r.fit.scale / TRUE.scale - 1)).toBeLessThan(0.01);
    expect(r.residuals).toHaveLength(3);
  });

  it("maps a north-up plan without reflection", () => {
    // UTM north is -z; the plan's y grows downwards, so +y on the page is +z.
    const r = fitSimilarity([
      { pdf: { x: 0, y: 0 }, scene: { x: 0, z: 0 } },
      { pdf: { x: 100, y: 0 }, scene: { x: 1, z: 0 } },
      { pdf: { x: 0, y: 100 }, scene: { x: 0, z: 1 } },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fit.rotation).toBeCloseTo(0, 12);
    expect(applyFit(r.fit, { x: 50, y: 100 })).toEqual({ x: expect.closeTo(0.5, 12), z: expect.closeTo(1, 12) });
  });

  it("refuses a mirrored set", () => {
    const r = fitSimilarity([
      { pdf: { x: 0, y: 0 }, scene: { x: 0, z: 0 } },
      { pdf: { x: 100, y: 0 }, scene: { x: 1, z: 0 } },
      { pdf: { x: 0, y: 100 }, scene: { x: 0, z: -1 } },
    ]);
    expect(r).toEqual({ ok: false, reason: "mirrored", message: MIRRORED });
  });

  it("refuses coincident or collinear points", () => {
    const at = (x: number, y: number) => ({ pdf: { x, y }, scene: { x: x / 100, z: y / 100 } });
    const message = "Pick points farther apart on the plan.";
    for (const set of [
      [at(10, 10), at(10, 10)],
      [at(10, 10), at(10.5, 10)],
      [at(0, 0), at(100, 100), at(200, 200)],
      [at(0, 0), at(100, 0), at(200, 0), at(300, 0)],
    ]) {
      const r = fitSimilarity(set);
      expect(r).toEqual({ ok: false, reason: "degenerate", message });
    }
  });

  it("never returns NaN, even when every scene point coincides", () => {
    const r = fitSimilarity([
      { pdf: { x: 0, y: 0 }, scene: { x: 1, z: 1 } },
      { pdf: { x: 100, y: 0 }, scene: { x: 1, z: 1 } },
    ]);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("null");
  });

  it("needs two pairs", () => {
    const r = fitSimilarity([pair(PDF[0])]);
    expect(r).toMatchObject({ ok: false, reason: "too-few" });
    expect(fitSimilarity([])).toMatchObject({ ok: false, reason: "too-few" });
  });
});
