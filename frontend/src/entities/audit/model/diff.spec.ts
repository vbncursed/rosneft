import { describe, expect, it } from "vitest";
import { diffRows, formatValue } from "./diff";

describe("diffRows", () => {
  it("reports a changed field with both sides", () => {
    expect(diffRows({ position_x: 8.2 }, { position_x: 12.4 })).toEqual([
      { field: "position_x", before: 8.2, after: 12.4, kind: "changed" },
    ]);
  });

  it("reports an added and a removed field", () => {
    expect(diffRows({}, { label: "Pump Jack A2" })).toEqual([
      { field: "label", before: undefined, after: "Pump Jack A2", kind: "added" },
    ]);
    expect(diffRows({ visible_panorama_ids: [4, 7] }, {})).toEqual([
      { field: "visible_panorama_ids", before: [4, 7], after: undefined, kind: "removed" },
    ]);
  });

  it("skips fields that did not move", () => {
    expect(diffRows({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual([
      { field: "b", before: 2, after: 3, kind: "changed" },
    ]);
  });

  it("ignores the timestamps that move on every write", () => {
    expect(diffRows({ created_at: "x", updated_at: "y" }, { created_at: "a", updated_at: "b" }))
      .toEqual([]);
  });

  it("compares structurally, so an equal nested transform is not a change", () => {
    const before = { transform: { position: { x: 1, y: 2, z: 3 } } };
    const after = { transform: { position: { x: 1, y: 2, z: 3 } } };
    expect(diffRows(before, after)).toEqual([]);
  });

  it("sees through to a real nested change", () => {
    const before = { transform: { position: { x: 1 } } };
    const after = { transform: { position: { x: 9 } } };
    expect(diffRows(before, after)).toHaveLength(1);
    expect(diffRows(before, after)[0].kind).toBe("changed");
  });

  it("keeps a missing column distinct from an empty one", () => {
    expect(diffRows({ label: null }, {})[0].kind).toBe("removed");
    expect(diffRows({ label: null }, { label: null })).toEqual([]);
    expect(diffRows({}, { label: null })[0]).toEqual({
      field: "label",
      before: undefined,
      after: null,
      kind: "added",
    });
  });

  it("treats a null snapshot as a creation or a deletion", () => {
    expect(diffRows(null, { slug: "t" })).toEqual([
      { field: "slug", before: undefined, after: "t", kind: "added" },
    ]);
    expect(diffRows({ slug: "t" }, null)).toEqual([
      { field: "slug", before: "t", after: undefined, kind: "removed" },
    ]);
    expect(diffRows(null, null)).toEqual([]);
  });

  it("returns fields in a stable alphabetical order", () => {
    const fields = diffRows({ z: 1, a: 1, m: 1 }, { z: 2, a: 2, m: 2 }).map((f) => f.field);
    expect(fields).toEqual(["a", "m", "z"]);
  });
});

describe("formatValue", () => {
  it("quotes strings so an empty one is visible", () => {
    expect(formatValue("Pump Jack A2")).toBe('"Pump Jack A2"');
    expect(formatValue("")).toBe('""');
  });

  it("writes structures as JSON", () => {
    expect(formatValue([4, 7])).toBe("[4,7]");
    expect(formatValue({ x: 1 })).toBe('{"x":1}');
  });

  it("writes an absent value as a dash, and null as null", () => {
    expect(formatValue(undefined)).toBe("—");
    expect(formatValue(null)).toBe("null");
  });

  it("writes numbers and booleans plainly", () => {
    expect(formatValue(12.4)).toBe("12.4");
    expect(formatValue(false)).toBe("false");
  });
});
