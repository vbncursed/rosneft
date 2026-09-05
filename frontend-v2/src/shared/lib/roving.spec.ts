import { describe, expect, it } from "vitest";
import { nextEnabled } from "./roving";

const none = () => false;

describe("nextEnabled", () => {
  it("steps forward and back", () => {
    expect(nextEnabled(4, 1, 1, none)).toBe(2);
    expect(nextEnabled(4, 1, -1, none)).toBe(0);
  });

  it("stops at the ends when it may not wrap", () => {
    expect(nextEnabled(4, 3, 1, none)).toBe(3);
    expect(nextEnabled(4, 0, -1, none)).toBe(0);
  });

  it("wraps around when allowed", () => {
    expect(nextEnabled(4, 3, 1, none, true)).toBe(0);
    expect(nextEnabled(4, 0, -1, none, true)).toBe(3);
  });

  it("skips over disabled entries", () => {
    const disabled = (i: number) => i === 1 || i === 2;
    expect(nextEnabled(4, 0, 1, disabled)).toBe(3);
    expect(nextEnabled(4, 3, -1, disabled)).toBe(0);
  });

  it("stays put when every other entry is disabled", () => {
    expect(nextEnabled(3, 0, 1, (i) => i !== 0)).toBe(0);
    expect(nextEnabled(3, 0, 1, (i) => i !== 0, true)).toBe(0);
  });

  it("stays put in a set of one", () => {
    expect(nextEnabled(1, 0, 1, none, true)).toBe(0);
  });
});
