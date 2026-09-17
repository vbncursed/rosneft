import { describe, expect, it } from "vitest";
import { bucketOf, windowStart } from "./window";

const NOW = new Date("2026-09-01T10:30:00Z");

describe("windowStart", () => {
  it("is 24 hours before the running hour, so a long-open tab does not drift", () => {
    expect(windowStart(NOW)).toBe("2026-08-31T10:00:00.000Z");
    expect(windowStart(new Date("2026-09-01T10:59:59Z"))).toBe("2026-08-31T10:00:00.000Z");
  });
});

describe("bucketOf", () => {
  it("buckets an entry by hour and drops one outside the 24 drawn", () => {
    const now = new Date("2026-09-01T10:30:00Z");
    expect(bucketOf("2026-09-01T10:05:00Z", now)).toBe(23);
    expect(bucketOf("2026-08-31T11:10:00Z", now)).toBe(0);
    expect(bucketOf("2026-08-31T10:59:00Z", now)).toBe(-1);
    // The upper bound too: an entry stamped in the hour after `now` is outside
    // the 24 drawn, not bucket 24 and not the last one.
    expect(bucketOf("2026-09-01T11:10:00Z", now)).toBe(-1);
  });
});
