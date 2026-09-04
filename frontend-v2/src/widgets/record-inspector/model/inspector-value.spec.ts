import { describe, expect, it } from "vitest";
import { inspectorValue } from "./inspector-value";

describe("inspectorValue", () => {
  it("writes a change as before → after", () => {
    expect(
      inspectorValue({
        field: "title",
        before: "Refinery Block",
        after: "Refinery Block C",
        kind: "changed",
      }),
    ).toBe('"Refinery Block" → "Refinery Block C"');
  });

  it("signs an addition with a plus", () => {
    expect(
      inspectorValue({
        field: "external_panorama_url",
        before: undefined,
        after: "https://tour.example.com/rbc",
        kind: "added",
      }),
    ).toBe('+ "https://tour.example.com/rbc"');
  });

  it("signs a removal with a minus", () => {
    expect(
      inspectorValue({
        field: "legacy_slug",
        before: "block-c-old",
        after: undefined,
        kind: "removed",
      }),
    ).toBe('− "block-c-old"');
  });

  it("writes structures and nulls without losing them", () => {
    expect(
      inspectorValue({ field: "ids", before: [4, 7], after: [4], kind: "changed" }),
    ).toBe("[4,7] → [4]");
    expect(
      inspectorValue({ field: "label", before: null, after: "x", kind: "changed" }),
    ).toBe('null → "x"');
  });
  it("names an id the refs know on either side of the arrow", () => {
    const refs = { "role_id:1": "Editor", "role_id:2": "Viewer" };
    expect(inspectorValue({ field: "role_id", before: "1", after: "2", kind: "changed" }, refs)).toBe("Editor → Viewer");
    expect(inspectorValue({ field: "role_id", before: undefined, after: "9", kind: "added" }, refs)).toBe('+ "9"');
  });
});
