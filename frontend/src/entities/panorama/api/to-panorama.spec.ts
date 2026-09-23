import { describe, expect, it } from "vitest";
import { toPanorama } from "./to-panorama";

const DTO = {
  id: 7,
  territorySlug: "t",
  slug: "control-room",
  title: "Control room, north door",
  sourceBlobHash: "h",
  position: { x: 1, y: 2, z: 3 },
  yawOffset: 0.5,
  defaultYaw: 1.2,
  thumbnailBlobHash: "t",
  updatedAt: "2026-09-14T10:00:00Z",
};

describe("toPanorama", () => {
  it("carries every field through untouched", () => {
    expect(toPanorama(DTO)).toEqual({ ...DTO });
  });

  it("maps a missing updatedAt to an empty string", () => {
    expect(toPanorama({ ...DTO, updatedAt: undefined }).updatedAt).toBe("");
  });

  it("maps a thumbnail not made yet to null — the row draws the glyph", () => {
    expect(toPanorama({ ...DTO, thumbnailBlobHash: undefined }).thumbnailBlobHash).toBeNull();
  });
});
