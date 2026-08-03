import { describe, it, expect } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { consoleLanding, requireConsolePermission } from "@/routes/guard";
import { markAuthed } from "@/auth/infrastructure/session-marker";
import type { Principal } from "@/auth/domain/principal";

const principal = (permissions: string[]): Principal => ({
  id: "u1",
  email: "u@example.com",
  username: "u",
  status: "active",
  totpEnabled: false,
  roleTitles: {},
  roleSlugs: [],
  permissions,
  isOwner: false,
  onboardingToursSeen: [],
});

// requireConsolePermission reads the principal through the query client.
const clientReturning = (me: Principal) =>
  ({ ensureQueryData: async () => me }) as unknown as Parameters<typeof requireConsolePermission>[0];

describe("consoleLanding", () => {
  it("sends a users:read principal to the users page", () => {
    expect(consoleLanding(principal(["users:read"]))).toBe("/admin/users");
  });

  it("sends a roles-only principal to the roles page", () => {
    // Hardcoding /admin/users here swapped one forbidden page for another.
    expect(consoleLanding(principal(["roles:read"]))).toBe("/admin/roles");
  });

  it("prefers users when the principal can read both", () => {
    expect(consoleLanding(principal(["users:read", "roles:read"]))).toBe("/admin/users");
  });
});

describe("requireConsolePermission", () => {
  it("passes when the principal holds the permission", async () => {
    markAuthed();
    await expect(
      requireConsolePermission(clientReturning(principal(["users:read"])), { href: "/admin/users" }, "users:read"),
    ).resolves.toBeUndefined();
  });

  it("redirects a roles-only principal off the users page to a page it can open", async () => {
    markAuthed();
    try {
      await requireConsolePermission(clientReturning(principal(["roles:read"])), { href: "/admin/users" }, "users:read");
      expect.unreachable("should redirect");
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { options: { to?: string } }).options.to).toBe("/admin/roles");
    }
  });

  it("still bounces to /login when there is no token at all", async () => {
    localStorage.clear();
    try {
      await requireConsolePermission(clientReturning(principal(["users:read"])), { href: "/admin/users" }, "users:read");
      expect.unreachable("should redirect");
    } catch (e) {
      expect((e as { options: { to?: string } }).options.to).toBe("/login");
    }
  });
});
