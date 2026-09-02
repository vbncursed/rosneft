import { describe, expect, it } from "vitest";
import { toPrincipal } from "./to-principal";

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

describe("toPrincipal", () => {
  it("carries the fields the console reads", () => {
    const p = toPrincipal(dto() as never);
    expect(p.username).toBe("a.ivanova");
    expect(p.permissions).toEqual(["users:read"]);
  });

  // An absent key means the owning service could not answer. Mapping it to
  // false would render a confident "2FA off" for a user who has it on.
  it("maps an absent totpEnabled to unknown, not to off", () => {
    expect(toPrincipal(dto() as never).totpEnabled).toBeNull();
  });

  it("keeps a present totpEnabled", () => {
    expect(toPrincipal(dto({ totpEnabled: true }) as never).totpEnabled).toBe(true);
    expect(toPrincipal(dto({ totpEnabled: false }) as never).totpEnabled).toBe(false);
  });

  // totpRequired is a column on the user's own row: always known, never null.
  it("keeps totpRequired a plain boolean", () => {
    expect(toPrincipal(dto({ totpRequired: true }) as never).totpRequired).toBe(true);
  });

  // A role deleted after it was granted leaves a slug with no title. The UI
  // falls back to the slug, so the map may be missing an entry.
  it("tolerates a slug with no title", () => {
    const p = toPrincipal(dto({ roleSlugs: ["ghost"], roleTitles: {} }) as never);
    expect(p.roleSlugs).toEqual(["ghost"]);
    expect(p.roleTitles.ghost).toBeUndefined();
  });
});
