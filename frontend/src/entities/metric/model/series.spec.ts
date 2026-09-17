import { describe, expect, it } from "vitest";
import { alignSeries, lastOf } from "./series";

const s = (label: string, pts: [number, number][]) => ({ label, points: pts.map(([t, v]) => ({ t, v })), labels: {} });

describe("series", () => {
  it("aligns co-plotted series on the union of timestamps, gaps as null", () => {
    expect(alignSeries([s("a", [[1, 10], [3, 30]]), s("b", [[1, 1], [2, 2], [3, 3]])])).toEqual([
      { label: "a", values: [10, null, 30] },
      { label: "b", values: [1, 2, 3] },
    ]);
    expect(alignSeries([])).toEqual([]);
  });

  it("reads the latest value of the first series, null when there is none", () => {
    expect(lastOf([s("a", [[1, 10], [3, 30]])])).toBe(30);
    expect(lastOf([s("a", [])])).toBeNull();
    expect(lastOf([])).toBeNull();
  });
});
