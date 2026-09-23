import { describe, expect, it } from "vitest";
import { toModel } from "./to-model";

describe("toModel", () => {
  it("maps the whole shape and drops empty optionals", () => {
    expect(
      toModel({
        slug: "hauler-truck",
        title: "Hauler Truck",
        description: "",
        sourceBlobHash: "b".repeat(64),
        thumbnailBlobHash: "",
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-31T00:00:00Z",
      }),
    ).toEqual({
      slug: "hauler-truck",
      title: "Hauler Truck",
      sourceBlobHash: "b".repeat(64),
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-31T00:00:00Z",
      usageCount: 0,
    });
  });

  it("keeps a present thumbnailBlobHash", () => {
    expect(
      toModel({
        slug: "hauler-truck",
        title: "Hauler Truck",
        sourceBlobHash: "b".repeat(64),
        thumbnailBlobHash: "c".repeat(64),
      }),
    ).toEqual({
      slug: "hauler-truck",
      title: "Hauler Truck",
      sourceBlobHash: "b".repeat(64),
      thumbnailBlobHash: "c".repeat(64),
      usageCount: 0,
    });
  });

  // Both the list and the Get endpoint fill usageCount; a genuinely omitted
  // key must default to 0, read as "used nowhere", not as an unanswered field.
  it("defaults a missing usageCount to 0, and keeps a present one", () => {
    expect(toModel({ slug: "m", title: "M", sourceBlobHash: "a".repeat(64) }).usageCount).toBe(0);
    expect(
      toModel({ slug: "m", title: "M", sourceBlobHash: "a".repeat(64), usageCount: 3 }).usageCount,
    ).toBe(3);
  });

  it("keeps the list payload's LODs, and leaves them out when the answer has none", () => {
    const lods = [{ lod: 0, hash: "h0", size: 30 }];
    expect(toModel({ slug: "m", title: "M", sourceBlobHash: "b".repeat(64), lods }).lods).toEqual(lods);
    expect(toModel({ slug: "m", title: "M", sourceBlobHash: "b".repeat(64) })).not.toHaveProperty("lods");
  });
});
