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
    });
  });
});
