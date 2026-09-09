import { describe, expect, it } from "vitest";
import { deriveTitle, slugPreview } from "./title";

describe("deriveTitle", () => {
  it("strips a .zip extension", () => {
    expect(deriveTitle("MyBuilding-v2.zip")).toBe("MyBuilding-v2");
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(deriveTitle("  pump jack .ZIP ")).toBe("pump jack");
  });
});

describe("slugPreview", () => {
  it("lower-cases and hyphenates", () => {
    expect(slugPreview("Refinery Block C")).toBe("refinery-block-c");
  });

  it("folds accented letters and drops punctuation, trimming stray hyphens", () => {
    expect(slugPreview("Ünïcode & co!")).toBe("unicode-co");
  });
});
