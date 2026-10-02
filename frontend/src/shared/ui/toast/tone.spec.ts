import { describe, expect, it } from "vitest";
import { waitsForReader } from "./tone";

describe("waitsForReader", () => {
  it.each(["error", "warning", "loading"] as const)("is true for %s", (tone) => {
    expect(waitsForReader(tone)).toBe(true);
  });
  it.each(["success", "info", "neutral"] as const)("is false for %s", (tone) => {
    expect(waitsForReader(tone)).toBe(false);
  });
});
