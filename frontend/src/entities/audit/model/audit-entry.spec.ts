import { describe, expect, it } from "vitest";
import { actorName, entityName, formatAt, isSystemChange, type AuditEntry } from "./audit-entry";

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

describe("entityName", () => {
  // spec §1.2: the trigger records the group's title as its label, so the journal
  // names a placement_group row with no special case.
  it("names a placement group by the title its trigger recorded", () => {
    expect(entityName(entry({ entity: "placement_group", entityId: "3", entityLabel: "Tank farm" }))).toBe("Tank farm");
  });

  it("is the label the journal recorded", () => {
    expect(entityName(entry())).toBe("Refinery Block C");
  });

  // A measurement has no label column: the trigger writes an empty one.
  it("names a measurement by its id", () => {
    expect(entityName(entry({ entity: "measurement", entityId: "42", entityLabel: "" }))).toBe("measurement #42");
  });

  it("leaves a label-less row of any other kind blank", () => {
    expect(entityName(entry({ entity: "session", entityId: "", entityLabel: "" }))).toBe("");
    expect(entityName(entry({ entityLabel: "" }))).toBe("");
  });
});
