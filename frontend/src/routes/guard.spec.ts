import { describe, it, expect, beforeEach } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { requireAuth } from "@/routes/guard";
import { setToken } from "@/auth/infrastructure/token-store";

describe("requireAuth", () => {
  beforeEach(() => localStorage.clear());

  it("throws a redirect to /login when no token", () => {
    try {
      requireAuth("/territories");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      const opts = (e as { options: { to?: string; search?: { next?: string } } }).options;
      expect(opts.to).toBe("/login");
      expect(opts.search?.next).toBe("/territories");
    }
  });

  it("does nothing when a token is present", () => {
    setToken("tok");
    expect(() => requireAuth("/territories")).not.toThrow();
  });
});
