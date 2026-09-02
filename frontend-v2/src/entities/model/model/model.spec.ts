import { describe, expect, it } from "vitest";
import { modelPath, thumbnailUrl, type Model } from "./model";

const model: Model = { slug: "storage-tank-500", title: "Storage Tank 500", sourceBlobHash: "a" };

describe("modelPath", () => {
  it("builds the detail route from a slug", () => {
    expect(modelPath("storage-tank-500")).toBe("/models/storage-tank-500");
  });
});

describe("thumbnailUrl", () => {
  it("points at the asset route when there is a thumbnail", () => {
    expect(thumbnailUrl({ ...model, thumbnailBlobHash: "deadbeef" })).toBe(
      "/api/assets/deadbeef",
    );
  });

  it("returns null when the hash is missing or empty", () => {
    expect(thumbnailUrl(model)).toBeNull();
    expect(thumbnailUrl({ ...model, thumbnailBlobHash: "" })).toBeNull();
  });
});
