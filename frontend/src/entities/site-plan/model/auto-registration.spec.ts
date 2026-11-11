import { describe, expect, it } from "vitest";
import { selectRegistrationPairs } from "./auto-registration";

const pairs = Array.from({ length: 25 }, (_, i) => ({
  pdf: { x: (i % 5) * 100, y: Math.floor(i / 5) * 100 },
  scene: { x: (i % 5) * 0.1, y: 0, z: Math.floor(i / 5) * 0.1 },
  utm: null,
}));

describe("selectRegistrationPairs", () => {
  it("limits reliable spread-out correspondences to twenty", () => {
    const result = selectRegistrationPairs(pairs, { width: 400, height: 400 }, 100);
    expect(result).toHaveLength(20);
    expect(new Set(result.map((p) => `${p.pdf.x}:${p.pdf.y}`)).size).toBe(20);
  });
  it("rejects a cluster of otherwise consistent matches", () => {
    expect(selectRegistrationPairs(pairs, { width: 10000, height: 10000 }, 100)).toEqual([]);
  });
  it("rejects a whole page collapsing onto a tiny part of the model", () => {
    const tiny = pairs.map((p) => ({ ...p, scene: { ...p.scene, x: p.scene.x / 1000, z: p.scene.z / 1000 } }));
    expect(selectRegistrationPairs(tiny, { width: 400, height: 400 }, 100)).toEqual([]);
  });
  it("rejects mirrored matches or scene outliers", () => {
    const mirrored = pairs.map((p) => ({ ...p, scene: { ...p.scene, x: -p.scene.x } }));
    expect(selectRegistrationPairs(mirrored, { width: 400, height: 400 }, 100)).toEqual([]);
    const corrupted = pairs.map((p, i) => (i === 0 ? { ...p, scene: { ...p.scene, x: 20 } } : p));
    expect(selectRegistrationPairs(corrupted, { width: 400, height: 400 }, 100)).toEqual([]);
  });
});
