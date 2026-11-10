import { describe, expect, it } from "vitest";
import { spreadMatches } from "./spread-matches";

describe("spreadMatches", () => {
  it("limits a broad match set and retains coverage", () => {
    const matches = Array.from({ length: 100 }, (_, i) => ({
      source: { x: i % 10, y: Math.floor(i / 10) },
      target: { x: i % 10, y: Math.floor(i / 10) },
    }));
    const result = spreadMatches(matches, { width: 10, height: 10 });
    expect(result).toHaveLength(20);
    expect(Math.max(...result.map((m) => m.source.x)) - Math.min(...result.map((m) => m.source.x))).toBeGreaterThan(7);
  });
  it("rejects matches concentrated in a small area", () => {
    const matches = Array.from({ length: 20 }, (_, i) => ({ source: { x: i, y: i }, target: { x: i, y: i } }));
    expect(spreadMatches(matches, { width: 1000, height: 1000 })).toEqual([]);
  });
});
