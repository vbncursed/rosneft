import { describe, expect, it } from "vitest";
import { formatDistance } from "./distance";

describe("formatDistance", () => {
  // unitRatio === 1 is the "metadata missing" sentinel → raw scene units, "u".
  it("uses raw units with magnitude-aware precision when unitRatio is 1", () => {
    expect(formatDistance(150, 1)).toBe("150.0 u"); // >=100 → 1 decimal
    expect(formatDistance(5, 1)).toBe("5.00 u"); //    >=1   → 2 decimals
    expect(formatDistance(0.5, 1)).toBe("0.500 u"); //  <1    → 3 decimals
  });

  // Any unitRatio !== 1 → metres, bucketed by magnitude.
  it("picks the right metric suffix by magnitude", () => {
    expect(formatDistance(1500, 2)).toBe("1.50 km");
    expect(formatDistance(5, 2)).toBe("5.00 m");
    expect(formatDistance(0.05, 2)).toBe("5.0 cm");
    expect(formatDistance(0.005, 2)).toBe("5 mm");
  });

  it("lands bucket boundaries on the higher unit (>=)", () => {
    expect(formatDistance(1000, 2)).toBe("1.00 km");
    expect(formatDistance(1, 2)).toBe("1.00 m");
    expect(formatDistance(0.01, 2)).toBe("1.0 cm");
  });

  it("buckets negative magnitudes by absolute value", () => {
    expect(formatDistance(-1500, 2)).toBe("-1.50 km");
    expect(formatDistance(-0.005, 2)).toBe("-5 mm");
  });
});
