import { describe, expect, it } from "vitest";
import { shortDate } from "./short-date";

describe("shortDate", () => {
  it("reads dd.mm from an ISO timestamp and null from nothing", () => {
    expect(shortDate("2026-08-31T10:15:00Z")).toBe("31.08");
    expect(shortDate("2026-01-05T00:00:00Z")).toBe("05.01");
    expect(shortDate(undefined)).toBeNull();
    expect(shortDate("not a date")).toBeNull();
  });
});
