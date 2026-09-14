import { describe, expect, it } from "vitest";
import { toDocument } from "./to-document";

const DTO = {
  id: 7,
  territorySlug: "t",
  title: "Plot plan.pdf",
  sourceBlobHash: "h",
  createdAt: "2026-09-14T10:00:00Z",
};

describe("toDocument", () => {
  it("carries every field through untouched", () => {
    expect(toDocument(DTO)).toEqual({ ...DTO });
  });

  it("maps a missing createdAt to an empty string", () => {
    expect(toDocument({ ...DTO, createdAt: undefined }).createdAt).toBe("");
  });
});
