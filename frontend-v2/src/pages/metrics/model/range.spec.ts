import { describe, expect, it } from "vitest";
import { METRIC_RANGES, RANGE_SECONDS } from "./range";

describe("METRIC_RANGES", () => {
  it("lists the windows shortest first, as the picker draws them", () => {
    expect(METRIC_RANGES).toEqual(["15m", "1h", "6h", "24h", "7d"]);
  });

  it("gives every window a duration", () => {
    for (const range of METRIC_RANGES) {
      expect(RANGE_SECONDS[range]).toBeGreaterThan(0);
    }
  });

  it("orders the durations the same way the labels are ordered", () => {
    const seconds = METRIC_RANGES.map((r) => RANGE_SECONDS[r]);
    expect([...seconds].sort((a, b) => a - b)).toEqual(seconds);
  });
});
