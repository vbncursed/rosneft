import { describe, expect, it } from "vitest";
import { toUser } from "./to-user";

const dto = (over: Record<string, unknown> = {}) => ({
  id: "u-1",
  email: "a@example.com",
  username: "a.ivanova",
  status: "active",
  roleSlugs: ["admin"],
  permissions: ["users:read"],
  isOwner: false,
  totpRequired: false,
  ...over,
});

describe("toUser", () => {
  it("maps an absent factor to unknown, never to off", () => {
    const u = toUser(dto() as never);
    expect(u.totpEnabled).toBeNull();
    expect(u.passkeyEnabled).toBeNull();
  });

  it("keeps a present factor and the requirement flag", () => {
    const u = toUser(dto({ totpEnabled: false, passkeyEnabled: true, totpRequired: true }) as never);
    expect(u.totpEnabled).toBe(false);
    expect(u.passkeyEnabled).toBe(true);
    expect(u.totpRequired).toBe(true);
  });

  it("tolerates a missing title map", () => {
    expect(toUser(dto() as never).roleTitles).toEqual({});
  });

  // A Go nil slice marshals to JSON null — the gateway sends exactly that for
  // an account with no roles. person-card.tsx/user-row.tsx call
  // roleSlugs.map(...) unguarded, so this must never reach the domain as null.
  it("defends roleSlugs against the gateway's null", () => {
    const u = toUser(dto({ roleSlugs: null }) as never);
    expect(u).toEqual({
      id: "u-1",
      email: "a@example.com",
      username: "a.ivanova",
      status: "active",
      totpEnabled: null,
      passkeyEnabled: null,
      totpRequired: false,
      roleSlugs: [],
      roleTitles: {},
      isOwner: false,
    });
  });
});
