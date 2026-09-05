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
      placementCount: 0,
    });
  });

  // Only the list endpoint fills placementCount; a Get path omits it, and 0
  // must read as "no placements", not as an unanswered field.
  it("defaults a missing placementCount to 0, and keeps a present one", () => {
    expect(toTerritory({ slug: "t", title: "T", sourceBlobHash: "a".repeat(64) }).placementCount).toBe(0);
    expect(
      toTerritory({ slug: "t", title: "T", sourceBlobHash: "a".repeat(64), placementCount: 14 })
        .placementCount,
    ).toBe(14);
  });
});
