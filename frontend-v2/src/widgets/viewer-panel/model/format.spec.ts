import { describe, expect, it } from "vitest";
import { formatSize, groupDigits } from "./format";

describe("groupDigits", () => {
  it("groups thousands", () => {
    expect(groupDigits(4812330)).toBe("4 812 330");
    expect(groupDigits(1604110)).toBe("1 604 110");
  });

  it("leaves short numbers alone", () => {
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(999)).toBe("999");
  });

  it("groups the boundary case", () => {
    expect(groupDigits(1000)).toBe("1 000");
  });

  it("rounds a fractional count rather than printing a decimal", () => {
    expect(groupDigits(1000.4)).toBe("1 000");
  });
});

describe("formatSize", () => {
  it("prints the three axes separated by slashes", () => {
    expect(formatSize({ x: 182, y: 44, z: 96 })).toBe("182 / 44 / 96");
  });

  it("rounds each axis", () => {
    expect(formatSize({ x: 181.6, y: 43.4, z: 96 })).toBe("182 / 43 / 96");
  });

  it("handles a flat model", () => {
    expect(formatSize({ x: 10, y: 0, z: 10 })).toBe("10 / 0 / 10");
  });
});
