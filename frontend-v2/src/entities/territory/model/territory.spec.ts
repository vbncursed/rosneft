import { describe, expect, it } from "vitest";
import { territoryPath } from "./territory";

describe("territoryPath", () => {
  it("builds the viewer route from a slug", () => {
    expect(territoryPath("refinery-block-c")).toBe("/territories/refinery-block-c");
  });
});
