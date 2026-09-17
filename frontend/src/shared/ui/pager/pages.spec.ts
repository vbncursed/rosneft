import { describe, expect, it } from "vitest";
import { pageList } from "./pages";

describe("pageList", () => {
  it("keeps the first, the last two and the current page's neighbours, with gaps between", () => {
    expect(pageList(1, 31)).toEqual([1, 2, "gap", 30, 31]);
    expect(pageList(5, 31)).toEqual([1, "gap", 4, 5, 6, "gap", 30, 31]);
    expect(pageList(31, 31)).toEqual([1, "gap", 30, 31]);
  });
  it("draws every page when there is no room for a gap", () => {
    expect(pageList(2, 3)).toEqual([1, 2, 3]);
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(1, 4)).toEqual([1, 2, 3, 4]);
  });
  it("clamps a page outside the count", () => {
    expect(pageList(0, 3)).toEqual([1, 2, 3]);
    expect(pageList(9, 3)).toEqual([1, 2, 3]);
  });
});
