import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageCount, pageSlice, pageSummary, rowsNeeded } from "./paging";

describe("paging", () => {
  it("is six a page", () => expect(PAGE_SIZE).toBe(6));

  it("counts pages, never fewer than one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(6)).toBe(1);
    expect(pageCount(7)).toBe(2);
    expect(pageCount(184)).toBe(31);
  });

  it("slices the page out of what is loaded — a short last page included", () => {
    const rows = Array.from({ length: 9 }, (_, i) => i + 1);
    expect(pageSlice(rows, 1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageSlice(rows, 2)).toEqual([7, 8, 9]);
    expect(pageSlice(rows, 3)).toEqual([]);
  });

  it("prints the mock's range", () => {
    expect(pageSummary(1, 184)).toBe("1–6 of 184 events");
    expect(pageSummary(31, 184)).toBe("181–184 of 184 events");
    expect(pageSummary(1, 1)).toBe("1–1 of 1 events");
  });

  it("knows how many rows a page needs loaded", () => {
    expect(rowsNeeded(1)).toBe(6);
    expect(rowsNeeded(4)).toBe(24);
  });
});
