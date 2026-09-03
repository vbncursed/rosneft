import { describe, expect, it } from "vitest";
import { can, grantableSlugs, type Principal } from "./principal";

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

describe("grantableSlugs", () => {
  const PERMISSIONS = [{ slug: "users:read" }, { slug: "users:write" }];

  it("gives an owner every slug, even holding no permissions itself", () => {
    expect(grantableSlugs(p({ isOwner: true }), PERMISSIONS)).toEqual(
      new Set(["users:read", "users:write"]),
    );
  });

  it("gives a holder only what it holds, mirroring the backend's no-escalation rule", () => {
    expect(grantableSlugs(p({ permissions: ["users:read"] }), PERMISSIONS)).toEqual(
      new Set(["users:read"]),
    );
  });

  it("gives no principal an empty set", () => {
    expect(grantableSlugs(null, PERMISSIONS)).toEqual(new Set());
  });
});
