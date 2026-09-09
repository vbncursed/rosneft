import { describe, expect, it } from "vitest";
import { parseAxis } from "./vec3";

describe("parseAxis", () => {
  it("reads plain and signed decimals", () => {
    expect(parseAxis("12.4")).toBe(12.4);
    expect(parseAxis("-3.1")).toBe(-3.1);
    expect(parseAxis("0")).toBe(0);
    expect(parseAxis("  7 ")).toBe(7);
  });

  it("returns null for a value still being typed", () => {
    expect(parseAxis("")).toBeNull();
    expect(parseAxis("-")).toBeNull();
    expect(parseAxis(".")).toBeNull();
  });

  it("returns null for anything that is not a number", () => {
    expect(parseAxis("abc")).toBeNull();
    expect(parseAxis("1e5")).toBeNull();
    expect(parseAxis("1,5")).toBeNull();
    expect(parseAxis("Infinity")).toBeNull();
  });
});
