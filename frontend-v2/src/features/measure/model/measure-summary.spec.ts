import { describe, expect, it } from "vitest";
import { measureSummary } from "./measure-summary";

const p = (x: number, y = 0, z = 0) => ({ x, y, z });

describe("measureSummary", () => {
  it("counts segments across chains and totals their length in source units", () => {
    const chains = [
      { id: 1, points: [p(0), p(1), p(1, 1)], closed: false },
      { id: 2, points: [p(0), p(0, 0, 2)], closed: false },
    ];
    expect(measureSummary(chains, 10)).toEqual({ segments: 3, total: "40.00 m" });
  });
  it("counts the closing segment of a closed chain", () => {
    expect(measureSummary([{ id: 1, points: [p(0), p(1), p(1, 1)], closed: true }], 1).segments).toBe(3);
  });
  it("is empty with no chains", () => {
    expect(measureSummary([], 10)).toEqual({ segments: 0, total: "0.00 m" });
  });
});
