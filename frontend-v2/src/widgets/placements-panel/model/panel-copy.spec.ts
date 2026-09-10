import { describe, expect, it } from "vitest";
import { footerFor, GUEST_FOOTER, NO_DELETE_FOOTER } from "./panel-copy";

describe("footerFor", () => {
  it("names the footer by what the grants leave out", () => {
    expect(footerFor({ create: false, write: false, delete: false })).toBe(GUEST_FOOTER);
    expect(footerFor({ create: true, write: true, delete: false })).toBe(NO_DELETE_FOOTER);
    expect(footerFor({ create: true, write: true, delete: true })).toBeNull();
    expect(footerFor({ create: false, write: true, delete: true })).toBeNull();
  });
});
