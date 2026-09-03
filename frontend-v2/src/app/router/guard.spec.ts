import { describe, expect, it } from "vitest";
import type { Principal } from "@/shared/session";
import {
  activeSection,
  consoleLanding,
  consoleNav,
  isConsoleHref,
  redirectTarget,
  screenAllowed,
  viewerOf,
} from "./guard";

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

describe("screenAllowed", () => {
  it("opens a screen to the grant that names it and to an owner", () => {
    expect(screenAllowed(principal({ permissions: ["roles:read"] }), "/console/roles")).toBe(true);
    expect(screenAllowed(principal({ permissions: ["roles:read"] }), "/console/users")).toBe(false);
    expect(screenAllowed(principal({ isOwner: true, permissions: [] }), "/console/metrics")).toBe(true);
  });
});

describe("consoleNav", () => {
  // Every screen is listed so the reader learns what the console has; the
  // ones they cannot open are marked rather than hidden.
  it("lists every screen in navigation order and disables the closed ones", () => {
    const items = consoleNav(principal({ permissions: ["audit:read"] }));
    expect(items.map((i) => i.key)).toEqual(["users", "roles", "content", "access", "audit", "metrics"]);
    expect(items.find((i) => i.key === "audit")?.disabled).toBeUndefined();
    expect(items.find((i) => i.key === "users")?.disabled).toBe(true);
    expect(items.find((i) => i.key === "users")?.href).toBe("/console/users");
  });
});

describe("activeSection", () => {
  it("names the section from the path, deep links included", () => {
    expect(activeSection("/console/roles")).toBe("roles");
    expect(activeSection("/console/audit/123")).toBe("audit");
    expect(activeSection("/console")).toBe("");
  });
});

describe("viewerOf", () => {
  it("shows the first role's title, Root for an owner without roles, and a dash otherwise", () => {
    expect(viewerOf(principal({ roleSlugs: ["admin"], roleTitles: { admin: "Company Owner" } })).roleTitle).toBe("Company Owner");
    expect(viewerOf(principal({ isOwner: true, roleSlugs: [] })).roleTitle).toBe("Root");
    expect(viewerOf(principal({ roleSlugs: [] })).roleTitle).toBe("—");
  });
});

describe("isConsoleHref", () => {
  it("claims console paths and nothing else", () => {
    expect(isConsoleHref("/console/users")).toBe(true);
    expect(isConsoleHref("/")).toBe(false);
    expect(isConsoleHref("https://example.com/console")).toBe(false);
  });
});
