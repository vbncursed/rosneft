import { describe, expect, it } from "vitest";
import { DELETE_GROUP, footerFor, GUEST_FOOTER, NEW_GROUP, NO_DELETE_FOOTER, VISIBLE_IN, VISIBLE_IN_NOTE } from "./panel-copy";

describe("footerFor", () => {
  it("names the footer by what the grants leave out", () => {
    expect(footerFor({ create: false, write: false, delete: false })).toBe(GUEST_FOOTER);
    expect(footerFor({ create: true, write: true, delete: false })).toBe(NO_DELETE_FOOTER);
    expect(footerFor({ create: true, write: true, delete: true })).toBeNull();
    expect(footerFor({ create: false, write: true, delete: true })).toBeNull();
  });
});

describe("VISIBLE_IN copy", () => {
  it("names the block and explains what hiding a marker does", () => {
    expect(VISIBLE_IN).toBe("Visible in");
    expect(VISIBLE_IN_NOTE).toContain("Hidden objects stay in the 3D scene");
  });
});

describe("group copy", () => {
  it("names the group actions the way spec §1.5 words them", () => {
    expect(NEW_GROUP).toBe("New group");
    expect(DELETE_GROUP).toBe("Delete group (placements stay)");
  });
});
