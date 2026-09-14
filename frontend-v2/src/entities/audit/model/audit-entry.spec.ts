import { describe, expect, it } from "vitest";
import { actorName, formatAt, isSystemChange, type AuditEntry } from "./audit-entry";

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: "2026-08-31T14:02:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "",
  companyLogin: "",
  action: "territory.insert",
  entity: "territory",
  entityId: "t-1",
  entityLabel: "Refinery Block C",
  territorySlug: "",
  oldRow: null,
  newRow: { slug: "refinery-block-c" },
  result: "ok",
  ...over,
});

describe("isSystemChange", () => {
  it("is true only when no actor is recorded", () => {
    expect(isSystemChange(entry({ actorId: "" }))).toBe(true);
    expect(isSystemChange(entry())).toBe(false);
  });
});

describe("actorName", () => {
  it("prefers the login", () => {
    expect(actorName(entry())).toBe("a.ivanova");
  });

  it("falls back to the id when the account is gone", () => {
    expect(actorName(entry({ actorLogin: "" }))).toBe("u-1");
  });

  it("names a system change rather than showing a blank", () => {
    expect(actorName(entry({ actorId: "", actorLogin: "" }))).toBe("system");
  });
});

describe("formatAt", () => {
  it("trims the instant to the minute the journal shows", () => {
    expect(formatAt("2026-08-31T14:02:11Z")).toBe("2026-08-31 14:02");
  });

  it("leaves an already-short value alone", () => {
    expect(formatAt("2026-08-31")).toBe("2026-08-31");
  });
});
