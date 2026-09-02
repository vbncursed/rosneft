import { describe, expect, it } from "vitest";
import type { Principal } from "@/shared/session";
import { consoleLanding, redirectTarget } from "./guard";

describe("redirectTarget", () => {
  // Where the user was headed is carried through, query string included: a
  // deep link that loses its search lands somewhere subtly different.
  it("sends an anonymous visitor to login, remembering where they were going", () => {
    expect(redirectTarget(false, "/console/audit?actor=a.ivanova")).toEqual({
      to: "/login",
      search: { next: "/console/audit?actor=a.ivanova" },
    });
  });

  it("lets a marked session through", () => {
    expect(redirectTarget(true, "/console/users")).toBeNull();
  });

  // The marker is a flag, not proof. A stale one gets through here and is
  // corrected by the first 401 — that is the design, not a hole.
  it("does not attempt to validate the session itself", () => {
    expect(redirectTarget(true, "/console/users")).toBeNull();
  });
});

const principal = (over: Partial<Principal> = {}): Principal => ({
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: false,
  onboardingToursSeen: [],
  ...over,
});

describe("consoleLanding", () => {
  it("sends an owner to the first screen in the navigation", () => {
    expect(consoleLanding(principal({ isOwner: true }))).toBe("/console/users");
  });

  // The shape hardcoding gets wrong: the console gate is an OR over several
  // grants, so naming /console/users as the landing sends a roles-only
  // administrator from one forbidden page to another.
  it("does not send a roles-only administrator to the users screen", () => {
    expect(consoleLanding(principal({ permissions: ["roles:read"] }))).toBe("/console/roles");
  });

  it("opens Content on either write grant", () => {
    expect(consoleLanding(principal({ permissions: ["model:write"] }))).toBe("/console/content");
    expect(consoleLanding(principal({ permissions: ["territory:write"] }))).toBe(
      "/console/content",
    );
  });

  it("lands an auditor on the journal", () => {
    expect(consoleLanding(principal({ permissions: ["audit:read"] }))).toBe("/console/audit");
  });

  // Metrics is owner-only and last, which is how a non-owner never lands there
  // and takes a 403 for it.
  it("never lands a non-owner on Metrics or Territory access", () => {
    expect(consoleLanding(principal({ permissions: ["audit:read"] }))).not.toBe(
      "/console/metrics",
    );
    expect(consoleLanding(principal({ permissions: ["audit:read"] }))).not.toBe("/console/access");
  });

  // A Viewer holds only territory:read and its siblings — a real account with
  // no console screen at all. Sending it somewhere would be a lie.
  it("answers null when no console screen is open to the caller", () => {
    expect(consoleLanding(principal({ permissions: ["territory:read"] }))).toBeNull();
  });
});
