import { describe, expect, it } from "vitest";
import { clearDigitAt, isComplete, sanitize, setDigitAt } from "./otp";

describe("sanitize", () => {
  it("drops non-digits and caps the length", () => {
    expect(sanitize("4a0-2 9 1 7 3", 6)).toBe("402917");
    expect(sanitize("", 6)).toBe("");
    expect(sanitize("abc", 6)).toBe("");
  });
});

describe("setDigitAt", () => {
  it("appends at the next free cell", () => {
    expect(setDigitAt("40", 2, "2", 6)).toBe("402");
  });

  it("overwrites an existing digit in place", () => {
    expect(setDigitAt("402917", 0, "9", 6)).toBe("902917");
  });

  it("keeps positions when a cell is skipped", () => {
    expect(setDigitAt("4", 2, "2", 6)).toBe("4 2");
  });

  it("ignores an index outside the code", () => {
    expect(setDigitAt("402", 6, "9", 6)).toBe("402");
    expect(setDigitAt("402", -1, "9", 6)).toBe("402");
  });
});

describe("clearDigitAt", () => {
  it("removes the last digit entirely", () => {
    expect(clearDigitAt("402", 2, 6)).toBe("40");
  });

  it("blanks a middle digit without shifting the rest", () => {
    expect(clearDigitAt("402917", 1, 6)).toBe("4 2917");
  });
});

describe("isComplete", () => {
  it("needs every cell filled", () => {
    expect(isComplete("402917", 6)).toBe(true);
    expect(isComplete("40291", 6)).toBe(false);
    expect(isComplete("4 2917", 6)).toBe(false);
  });
});
