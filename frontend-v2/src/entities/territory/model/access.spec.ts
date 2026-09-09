import { describe, expect, it } from "vitest";
import {
  grantAction,
  hasInheritedGrants,
  isRevocable,
  VISIBILITY_TITLE,
  VISIBILITY_TONE,
  type AccessGrant,
} from "./access";

const grant = (over: Partial<AccessGrant> = {}): AccessGrant => ({
  userId: "u-3",
  username: "k.petrov",
  roleTitle: "Field Operator",
  via: "direct",
  ...over,
});

describe("isRevocable", () => {
  it("allows only a direct grant to be taken away", () => {
    expect(isRevocable(grant())).toBe(true);
    expect(isRevocable(grant({ via: "role" }))).toBe(false);
    expect(isRevocable(grant({ via: "owner" }))).toBe(false);
  });
});

describe("grantAction", () => {
  it("names the control by why it cannot revoke", () => {
    expect(grantAction(grant())).toBe("remove");
    expect(grantAction(grant({ via: "role" }))).toBe("locked");
    expect(grantAction(grant({ via: "owner" }))).toBe("pinned");
  });

  it("agrees with isRevocable", () => {
    for (const via of ["direct", "role", "owner"] as const) {
      const g = grant({ via });
      expect(grantAction(g) === "remove").toBe(isRevocable(g));
    }
  });
});

describe("hasInheritedGrants", () => {
  it("is true only when a role granted someone access", () => {
    expect(hasInheritedGrants([grant(), grant({ via: "owner" })])).toBe(false);
    expect(hasInheritedGrants([grant(), grant({ via: "role" })])).toBe(true);
    expect(hasInheritedGrants([])).toBe(false);
  });
});

describe("visibility tables", () => {
  it("tones each visibility distinctly", () => {
    expect(VISIBILITY_TONE.assigned).toBe("accent");
    expect(VISIBILITY_TONE.company).toBe("ok");
    expect(VISIBILITY_TONE.private).toBe("neutral");
  });

  it("titles each visibility in the words the panel uses", () => {
    expect(VISIBILITY_TITLE.assigned).toBe("Assigned people");
    expect(VISIBILITY_TITLE.company).toBe("Whole company");
    expect(VISIBILITY_TITLE.private).toBe("Owner only");
  });
});
