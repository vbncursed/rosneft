import { describe, it, expect, beforeEach } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { requireAuth } from "@/routes/guard";
import { markAuthed } from "@/auth/infrastructure/session-marker";

function redirectOf(href: string) {
  try {
    requireAuth({ href });
    expect.unreachable("should have thrown");
  } catch (e) {
    expect(isRedirect(e)).toBe(true);
    return (e as { options: { to?: string; search?: { next?: string } } }).options;
  }
}

describe("requireAuth", () => {
  beforeEach(() => localStorage.clear());

  it("throws a redirect to /login when no token", () => {
    const opts = redirectOf("/territories");
    expect(opts?.to).toBe("/login");
    expect(opts?.search?.next).toBe("/territories");
  });

  it("keeps the query string so ?jobId= survives the login round trip", () => {
    // Without it the user lands on the territory with no jobId and the
    // conversion screen falls back to polling instead of live SSE progress.
    const opts = redirectOf("/territories/north?jobId=j1");
    expect(opts?.search?.next).toBe("/territories/north?jobId=j1");
  });

  it("does nothing when a token is present", () => {
    markAuthed();
    expect(() => requireAuth({ href: "/territories" })).not.toThrow();
  });
});
