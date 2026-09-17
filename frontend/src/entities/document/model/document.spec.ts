import { describe, expect, it } from "vitest";
import { documentFileName, type Document } from "./document";

describe("documentFileName", () => {
  it("returns the title", () => {
    const doc: Document = {
      id: 1,
      territorySlug: "t",
      title: "Plot plan.pdf",
      sourceBlobHash: "h",
      createdAt: "",
    };
    expect(documentFileName(doc)).toBe("Plot plan.pdf");
  });
});
