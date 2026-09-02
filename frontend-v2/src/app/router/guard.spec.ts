import { describe, expect, it } from "vitest";
import { redirectTarget } from "./guard";

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
