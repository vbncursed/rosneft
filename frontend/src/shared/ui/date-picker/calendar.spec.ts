import { describe, expect, it } from "vitest";
import { dayLabel, daysInMonth, monthGrid, monthLabel, parseIso, shiftMonth, toIso } from "./calendar";

describe("parseIso", () => {
  it("reads a well-formed date without touching the timezone", () => {
    expect(parseIso("2026-08-24")).toEqual({ year: 2026, month: 7, day: 24 });
    expect(parseIso("2026-01-01")).toEqual({ year: 2026, month: 0, day: 1 });
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseIso("2026-8-24")).toBeNull();
    expect(parseIso("not-a-date")).toBeNull();
    expect(parseIso("2026-13-01")).toBeNull();
    expect(parseIso("2026-02-30")).toBeNull();
  });

  it("accepts a leap day only in a leap year", () => {
    expect(parseIso("2028-02-29")).toEqual({ year: 2028, month: 1, day: 29 });
    expect(parseIso("2026-02-29")).toBeNull();
  });
});

describe("daysInMonth", () => {
  it("counts February correctly across leap years", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2026, 0)).toBe(31);
    expect(daysInMonth(2026, 3)).toBe(30);
  });
});

describe("monthGrid", () => {
  it("always returns whole Monday-started weeks", () => {
    for (let month = 0; month < 12; month += 1) {
      const grid = monthGrid(2026, month);
      expect(grid.length % 7).toBe(0);
      expect(grid.length).toBeGreaterThanOrEqual(28);
    }
  });

  it("starts August 2026 on the right weekday", () => {
    // 1 Aug 2026 is a Saturday, so the first row carries five July days.
    const grid = monthGrid(2026, 7);
    expect(grid[0].iso).toBe("2026-07-27");
    expect(grid[0].inMonth).toBe(false);
    expect(grid[5].iso).toBe("2026-08-01");
    expect(grid[5].inMonth).toBe(true);
  });

  it("marks every day of the month as in-month exactly once", () => {
    const grid = monthGrid(2026, 7);
    const inMonth = grid.filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(new Set(inMonth.map((d) => d.iso)).size).toBe(31);
  });

  it("handles a month that begins on Monday with no lead-in", () => {
    // 1 June 2026 is a Monday.
    const grid = monthGrid(2026, 5);
    expect(grid[0].iso).toBe("2026-06-01");
    expect(grid[0].inMonth).toBe(true);
  });
});

describe("shiftMonth", () => {
  it("rolls over the year in both directions", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 7, 0)).toEqual({ year: 2026, month: 7 });
  });
});

describe("toIso and monthLabel", () => {
  it("zero-pads and names the month", () => {
    expect(toIso(2026, 0, 5)).toBe("2026-01-05");
    expect(monthLabel(2026, 7)).toBe("August 2026");
  });
});

describe("dayLabel", () => {
  it("spells a day out for assistive tech", () => {
    expect(dayLabel("2026-08-24")).toBe("24 August 2026");
    expect(dayLabel("2026-01-01")).toBe("1 January 2026");
  });

  it("falls back to the raw string it cannot parse", () => {
    expect(dayLabel("nonsense")).toBe("nonsense");
  });
});
