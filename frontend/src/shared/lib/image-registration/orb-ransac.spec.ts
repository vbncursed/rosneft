import { describe, expect, it } from "vitest";
import { fitImageMatches } from "./orb-ransac";

describe("fitImageMatches", () => {
  it("finds a similarity among outliers", () => {
    const matches = Array.from({ length: 40 }, (_, i) => ({
      source: { x: (i % 8) * 30, y: Math.floor(i / 8) * 40 },
      target: i < 30 ? { x: 2 * ((i % 8) * 30) + 10, y: 2 * (Math.floor(i / 8) * 40) - 5 } : { x: i * 123, y: i * i },
    }));
    const result = fitImageMatches(matches, 2);
    expect(result.length).toBeGreaterThanOrEqual(30);
    expect(result.every((m) => m.target.x === 2 * m.source.x + 10)).toBe(true);
  });
  it("refuses a small or unrelated set", () => {
    expect(fitImageMatches([{ source: { x: 0, y: 0 }, target: { x: 0, y: 0 } }], 2)).toEqual([]);
  });
});
