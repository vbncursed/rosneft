import { describe, expect, it } from "vitest";
import { toTerritory } from "./to-territory";

describe("toTerritory", () => {
  it("maps the whole shape and drops empty optionals", () => {
    expect(
      toTerritory({
        slug: "north-ridge-pad",
        title: "North Ridge Pad",
        description: "",
        externalPanoramaUrl: "",
        sourceBlobHash: "a".repeat(64),
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-31T00:00:00Z",
      }),
    ).toEqual({
      slug: "north-ridge-pad",
      title: "North Ridge Pad",
      sourceBlobHash: "a".repeat(64),
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-31T00:00:00Z",
    });
  });
});
