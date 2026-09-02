import { describe, expect, it } from "vitest";
import { can, type Principal } from "./principal";

const p = (over: Partial<Principal> = {}): Principal => ({
  id: "u-1",
  email: "a@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: false,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: false,
  onboardingToursSeen: [],
  ...over,
});

describe("can", () => {
  it("grants a permission the principal holds", () => {
    expect(can(p({ permissions: ["users:read"] }), "users:read")).toBe(true);
  });

  it("refuses one it does not", () => {
    expect(can(p({ permissions: ["users:read"] }), "roles:manage")).toBe(false);
  });

  // Mirrors the gateway's owner bypass, so a Root carrying no roles is not
  // locked out of a console it is allowed to open.
  it("lets an owner through with no permissions at all", () => {
    expect(can(p({ isOwner: true }), "anything:at:all")).toBe(true);
  });

  it("refuses when there is no principal yet", () => {
    expect(can(null, "users:read")).toBe(false);
  });
});
