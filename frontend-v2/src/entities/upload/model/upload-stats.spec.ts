import { describe, expect, it } from "vitest";
import { formatEta, uploadStats } from "./upload-stats";

const MB = 1024 * 1024;

describe("uploadStats", () => {
  it("reads speed off the most recent two samples, and ETA off the remaining bytes", () => {
    const total = 20 * MB;
    const { bytesPerSecond, etaSeconds } = uploadStats(
      [
        { at: 0, bytes: 0 },
        { at: 1000, bytes: 8 * MB },
      ],
      total,
    );
    expect(bytesPerSecond).toBeCloseTo(8 * MB, 0);
    expect(etaSeconds).toBeCloseTo((total - 8 * MB) / (8 * MB), 5);
  });

  it("answers null for both with fewer than two samples", () => {
    expect(uploadStats([], 10)).toEqual({ bytesPerSecond: null, etaSeconds: null });
    expect(uploadStats([{ at: 0, bytes: 0 }], 10)).toEqual({ bytesPerSecond: null, etaSeconds: null });
  });

  it("answers null rather than dividing by zero when two samples share a timestamp", () => {
    const { bytesPerSecond, etaSeconds } = uploadStats(
      [
        { at: 500, bytes: 0 },
        { at: 500, bytes: 8 * MB },
      ],
      20 * MB,
    );
    expect(bytesPerSecond).toBeNull();
    expect(etaSeconds).toBeNull();
  });
});

describe("formatEta", () => {
  it("reads under a minute as <1 min", () => {
    expect(formatEta(30)).toBe("<1 min");
  });

  it("rounds a minute or more to the nearest minute", () => {
    expect(formatEta(190)).toBe("~3 min");
  });

  it("is blank with nothing to estimate", () => {
    expect(formatEta(null)).toBe("");
  });
});
