import { describe, expect, it } from "vitest";
import { territoryPath } from "./territory";

describe("territoryPath", () => {
  it("builds the viewer route from a slug", () => {
    expect(territoryPath("refinery-block-c")).toBe("/territories/refinery-block-c");
  });

  it("encodes a slug that needs it", () => {
    expect(territoryPath("a b")).toBe("/territories/a%20b");
  });
});
