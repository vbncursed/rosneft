import { describe, expect, it } from "vitest";
import type { SceneBundle } from "@/entities/scene";
import type { Principal } from "@/shared/session";
import {
  activeSection,
  CATALOG_PATHS,
  consoleLanding,
  consoleNav,
  enrollmentRedirect,
  isCatalogHref,
  isTerritoryPage,
  redirectTarget,
  routesInApp,
  screenAllowed,
  viewerRoute,
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

describe("routesInApp", () => {
  const CLICK = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 };

  it("routes a console href on a plain left click", () => {
    expect(routesInApp("/console/users", CLICK)).toBe(true);
  });

  it("leaves a non-console href to the browser", () => {
    expect(routesInApp("/old-viewer", CLICK)).toBe(false);
  });

  it("leaves an absolute URL to the browser", () => {
    expect(routesInApp("https://example.com/console", CLICK)).toBe(false);
  });

  // A modified click means "open in a new tab/window" or "extend selection" —
  // any of the four must fall back to a real navigation.
  it("leaves a modified click to the browser", () => {
    expect(routesInApp("/console/users", { ...CLICK, metaKey: true })).toBe(false);
    expect(routesInApp("/console/users", { ...CLICK, ctrlKey: true })).toBe(false);
    expect(routesInApp("/console/users", { ...CLICK, shiftKey: true })).toBe(false);
    expect(routesInApp("/console/users", { ...CLICK, altKey: true })).toBe(false);
  });

  it("leaves a non-primary button click to the browser", () => {
    expect(routesInApp("/console/users", { ...CLICK, button: 1 })).toBe(false);
  });

  it("does nothing for a missing href", () => {
    expect(routesInApp(null, CLICK)).toBe(false);
    expect(routesInApp(undefined, CLICK)).toBe(false);
  });

  // The catalog shell has no sidebar, but its four routes still stay in the
  // SPA rather than reloading — a console screen links to /territories too.
  it("routes a catalog href on a plain left click", () => {
    expect(routesInApp("/territories", CLICK)).toBe(true);
  });

  it("leaves a modified click on a catalog href to the browser", () => {
    expect(routesInApp("/territories", { ...CLICK, metaKey: true })).toBe(false);
  });
});

describe("isCatalogHref", () => {
  it("matches each catalog path, with or without a query", () => {
    for (const path of CATALOG_PATHS) {
      expect(isCatalogHref(path)).toBe(true);
      expect(isCatalogHref(`${path}?from=console`)).toBe(true);
    }
  });

  it("matches Home itself, and still refuses login", () => {
    expect(isCatalogHref("/")).toBe(true);
    expect(isCatalogHref("/?x=1")).toBe(true);
    expect(isCatalogHref("/login")).toBe(false);
  });

  // A model page, a territory's replace form and the territory's own page — the
  // conversion screen while it converts, the viewer once it is ready — are all v2.
  it("matches a model page, a territory's replace form and a territory page", () => {
    expect(isCatalogHref("/models/pump")).toBe(true);
    expect(isCatalogHref("/models/pump?from=library")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge/replace")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge?jobId=abc")).toBe(true);
    expect(isCatalogHref("/territories/north-ridge/other")).toBe(false);
    expect(isCatalogHref("/models/pump/extra")).toBe(false);
  });

  it("routes the account page in-app rather than reloading the document", () => {
    expect(isCatalogHref("/account")).toBe(true);
  });

  it("routes the wizard in-app, query string and all", () => {
    expect(isCatalogHref("/account/two-factor")).toBe(true);
    expect(isCatalogHref("/account/two-factor?mode=regenerate")).toBe(true);
  });

  // The wizard's exit and the done card's link must not reload the document.
  it("routes the enrolment gate in-app, done stage and all", () => {
    expect(isCatalogHref("/two-factor-required?stage=done")).toBe(true);
  });
});

describe("isTerritoryPage", () => {
  // The shell reads the pathname to pick its layout: a territory's own page is
  // the viewport viewer, every sibling path stays a padded document column.
  it("matches a territory's own page and nothing beside it", () => {
    expect(isTerritoryPage("/territories/north-ridge")).toBe(true);
    expect(isTerritoryPage("/territories/north-ridge/replace")).toBe(false);
  });

  // /territories/new is slug-shaped and the bare TERRITORY_PAGE regex matches
  // it — the upload form under `viewport` is h-dvh with no padding, so the
  // layout predicate has to say no to the one path the route tree claims first.
  it("refuses the list, the upload form and a model page", () => {
    expect(isTerritoryPage("/territories")).toBe(false);
    expect(isTerritoryPage("/territories/new")).toBe(false);
    expect(isTerritoryPage("/models/pump")).toBe(false);
  });
});

describe("viewerRoute", () => {
  const lod0 = { lod: 0, hash: "a", size: 1 };
  const bundle = (chain: { lod: number; hash: string; size: number }[]) =>
    ({ artifact: chain.length ? { chain } : null }) as unknown as SceneBundle;

  it("opens the viewer only for a converted territory nobody is watching a job on", () => {
    expect(viewerRoute(bundle([lod0]), undefined)).toBe(true);
  });

  // Replace Source keeps the old LOD0 while the new archive converts, so the
  // bundle says "ready" and the reader would land on last week's scene with no
  // pipeline in sight. A jobId in the URL means someone is watching a run.
  it("keeps the conversion page while a job is being watched, LOD0 or not", () => {
    expect(viewerRoute(bundle([lod0]), "job-1")).toBe(false);
  });

  it("keeps the conversion page when nothing is converted, and before the bundle lands", () => {
    expect(viewerRoute(bundle([]), undefined)).toBe(false);
    expect(viewerRoute(undefined, undefined)).toBe(false);
  });
});

const PRINCIPAL: Principal = {
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: false,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: false,
  onboardingToursSeen: [],
};

describe("enrollmentRedirect", () => {
  const owes = { ...PRINCIPAL, totpRequired: true, totpEnabled: false };
  it.each(["/", "/territories", "/territories/x", "/models", "/account", "/console", "/console/users"])(
    "sends a principal that must enroll from %s to the gate",
    (path) => expect(enrollmentRedirect(owes, path)).toBe("/two-factor-required"),
  );
  it.each(["/two-factor-required", "/account/two-factor"])("lets it through at %s", (path) =>
    expect(enrollmentRedirect(owes, path)).toBeNull(),
  );
  it("never redirects an account that owes nothing", () => {
    expect(enrollmentRedirect({ ...PRINCIPAL, totpRequired: true, totpEnabled: true }, "/")).toBeNull();
    expect(enrollmentRedirect({ ...PRINCIPAL, totpRequired: false, totpEnabled: false }, "/")).toBeNull();
  });
});
