import { describe, expect, it } from "vitest";
import { slugError, titleError } from "./tag-input";

describe("slugError", () => {
  it.each(["ab", "camps", "tank-farms", "a1-b2-c3", "x".repeat(40)])("accepts %s", (slug) => {
    expect(slugError(slug)).toBeNull();
  });

  it.each([
    ["", "Enter a slug."],
    ["a", "Use 2 to 40 characters."],
    ["x".repeat(41), "Use 2 to 40 characters."],
    ["Camps", "Use lowercase letters, digits and single hyphens."],
    ["-camps", "Use lowercase letters, digits and single hyphens."],
    ["camps-", "Use lowercase letters, digits and single hyphens."],
    ["tank--farms", "Use lowercase letters, digits and single hyphens."],
    ["tank farms", "Use lowercase letters, digits and single hyphens."],
  ])("refuses %j", (slug, message) => {
    expect(slugError(slug)).toBe(message);
  });
});

describe("titleError", () => {
  it("accepts a title once trimmed, up to 120 characters", () => {
    expect(titleError("  Camps  ")).toBeNull();
    expect(titleError("x".repeat(120))).toBeNull();
  });

  it("refuses an empty or blank title", () => {
    expect(titleError("")).toBe("Enter a title.");
    expect(titleError("   ")).toBe("Enter a title.");
  });

  it("measures the trimmed title", () => {
    expect(titleError("x".repeat(121))).toBe("Use at most 120 characters.");
    expect(titleError(` ${"x".repeat(120)} `)).toBeNull();
  });
});
