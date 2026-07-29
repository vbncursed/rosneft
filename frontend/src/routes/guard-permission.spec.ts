import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { requirePermission } from "@/routes/guard";
import { markAuthed } from "@/auth/infrastructure/session-marker";
import type { Principal } from "@/auth/domain/principal";

function clientReturning(me: Partial<Principal>) {
  const qc = new QueryClient();
  vi.spyOn(qc, "ensureQueryData").mockResolvedValue(me as Principal);
  return qc;
}

describe("requirePermission", () => {
  beforeEach(() => {
    localStorage.clear();
    markAuthed();
  });

  it("passes when the principal has the permission", async () => {
    const qc = clientReturning({ isOwner: false, permissions: ["territory:write"] });
    await expect(requirePermission(qc, { href: "/territories/new" }, "territory:write")).resolves.toBeUndefined();
  });

  it("redirects home when the permission is missing", async () => {
    const qc = clientReturning({ isOwner: false, permissions: [] });
    try {
      await requirePermission(qc, { href: "/territories/new" }, "territory:write");
      expect.unreachable("should redirect");
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      expect((e as { options: { to?: string } }).options.to).toBe("/");
    }
  });

  it("redirects to /login when there is no token (via requireAuth)", async () => {
    localStorage.clear();
    const qc = clientReturning({ permissions: [] });
    try {
      await requirePermission(qc, { href: "/territories/new" }, "territory:write");
      expect.unreachable("should redirect");
    } catch (e) {
      expect((e as { options: { to?: string } }).options.to).toBe("/login");
    }
  });
});
