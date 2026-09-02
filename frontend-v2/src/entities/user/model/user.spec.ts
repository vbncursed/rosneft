import { describe, expect, it } from "vitest";
import { knownLabel, knownTone, roleTitle, STATUS_TONE, type User } from "./user";

const user = (over: Partial<User> = {}): User => ({
  id: "u-1",
  username: "a.ivanova",
  email: "a.ivanova@example.com",
  status: "active",
  totpEnabled: true,
  passkeyEnabled: true,
  roleSlugs: ["admin"],
  roleTitles: { admin: "Company Owner" },
  isOwner: true,
  ...over,
});

describe("knownLabel", () => {
  it("distinguishes no from unknown", () => {
    expect(knownLabel(true)).toBe("Yes");
    expect(knownLabel(false)).toBe("No");
    expect(knownLabel(null)).toBe("—");
  });
});

describe("knownTone", () => {
  it("greys out the unknown rather than colouring it as a failure", () => {
    expect(knownTone(true)).toBe("ok");
    expect(knownTone(false)).toBe("bad");
    expect(knownTone(null)).toBe("dim");
  });
});

describe("STATUS_TONE", () => {
  it("maps each account status to its meaning", () => {
    expect(STATUS_TONE.active).toBe("ok");
    expect(STATUS_TONE.frozen).toBe("warn");
    expect(STATUS_TONE.deleted).toBe("dim");
  });
});

describe("roleTitle", () => {
  it("shows the display title, which is not the slug", () => {
    expect(roleTitle(user(), "admin")).toBe("Company Owner");
  });

  it("falls back to the slug when the role was deleted after being granted", () => {
    expect(roleTitle(user(), "ghost")).toBe("ghost");
  });
});
