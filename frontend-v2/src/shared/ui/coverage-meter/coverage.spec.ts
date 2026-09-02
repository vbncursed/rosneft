import { describe, expect, it } from "vitest";
import { coverageSummary, share, type CoverageSegment } from "./coverage";

const SEGMENTS: CoverageSegment[] = [
  { tone: "ok", value: 18, label: "2FA + passkey" },
  { tone: "warn", value: 3, label: "2FA only" },
  { tone: "bad", value: 5, label: "password only" },
];

describe("share", () => {
  it("gives each segment its percentage of the whole", () => {
    expect(share(SEGMENTS, 0)).toBe(69);
    expect(share(SEGMENTS, 1)).toBe(12);
    expect(share(SEGMENTS, 2)).toBe(19);
  });

  it("returns zero for an empty population rather than dividing by zero", () => {
    expect(share([{ tone: "ok", value: 0, label: "none" }], 0)).toBe(0);
  });

  it("gives a single segment the whole bar", () => {
    expect(share([{ tone: "ok", value: 7, label: "all" }], 0)).toBe(100);
  });
});

describe("coverageSummary", () => {
  it("spells the split out for a reader who cannot see the bar", () => {
    expect(coverageSummary("2FA coverage", SEGMENTS)).toBe(
      "2FA coverage: 2FA + passkey 69%, 2FA only 12%, password only 19%",
    );
  });

  it("leaves empty segments out of the summary", () => {
    const summary = coverageSummary("2FA coverage", [
      { tone: "ok", value: 10, label: "covered" },
      { tone: "bad", value: 0, label: "uncovered" },
    ]);
    expect(summary).toBe("2FA coverage: covered 100%");
  });

  it("says so when there is nobody to count", () => {
    expect(coverageSummary("2FA coverage", [])).toBe("2FA coverage: nothing to show");
    expect(
      coverageSummary("2FA coverage", [{ tone: "ok", value: 0, label: "covered" }]),
    ).toBe("2FA coverage: nothing to show");
  });
});
