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
});
