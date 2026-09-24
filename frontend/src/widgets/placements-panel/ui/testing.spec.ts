import { describe, expect, it } from "vitest";
import { ctx } from "./testing";

describe("placements-panel test helpers", () => {
  it("builds a fully granted, collapsed row context with fresh spies each call", () => {
    const a = ctx();
    expect(a).toMatchObject({ expanded: null, selectedId: null, grants: { create: true, write: true, delete: true } });
    expect(a.onSelect).not.toBe(ctx().onSelect);
  });

  it("lets an override replace any field", () => {
    expect(ctx({ expanded: "group:4", selectedId: 2 })).toMatchObject({ expanded: "group:4", selectedId: 2 });
  });
});
