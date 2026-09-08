import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "./audit-entry";
import { dayOf, relativeAt, summaryOf } from "./relative-at";

// relativeAt prints the reader's *local* clock — an event that happened ten
// minutes ago must not read as yesterday because UTC has already rolled over.
// That makes every expectation below a function of the machine's timezone, so
// the file pins one: UTC, which is what the ISO instants in the fixtures are
// already written in. Without this the whole block passes only on a UTC box
// (this repo's dev machine is UTC+5) — a green CI and a red laptop.
// stubEnv, not a hand-rolled save/restore: TZ is unset on this box and in CI,
// and `process.env.TZ = undefined` writes the *string* "undefined", which is
// not a valid zone and silently leaves the process on UTC for every spec that
// runs after this one. Only vitest's file isolation was hiding that.
beforeAll(() => vi.stubEnv("TZ", "UTC"));
afterAll(() => vi.unstubAllEnvs());

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

describe("summaryOf", () => {
  it("names what was touched", () => {
    expect(summaryOf(entry({ action: "territory.update", entityLabel: "Refinery Block C" })))
      .toBe("Refinery Block C");
  });

  it("adds the territory when the change happened inside one", () => {
    expect(
      summaryOf(
        entry({
          action: "placement.update",
          entityLabel: "Storage Tank 500",
          territorySlug: "refinery-block-c",
        }),
      ),
    ).toBe("Storage Tank 500 · refinery-block-c");
  });

  // Real rows, copied off a live GET /api/audit/mine: every auth.* entry the
  // gateway writes carries entity "session" with an empty entityId,
  // entityLabel and territorySlug. Falling back to `entity` printed the table
  // name at fifty rows of "auth.login · session" — a word the reader cannot
  // use and did not ask for. Nothing usable means no second line at all.
  it("says nothing when the row carries nothing a person can use", () => {
    expect(
      summaryOf(entry({ action: "auth.login", entity: "session", entityId: "", entityLabel: "" })),
    ).toBe("");
    expect(
      summaryOf(
        entry({ action: "auth.passkey_register", entity: "session", entityId: "", entityLabel: "" }),
      ),
    ).toBe("");
    // Not only auth rows: a user_role insert is written the same way.
    expect(
      summaryOf(entry({ action: "user_role.insert", entity: "user_role", entityId: "", entityLabel: "" })),
    ).toBe("");
  });

  // Still worth a line when it failed — that is the one thing the row says
  // beyond its action, and the console prints it too.
  it("still says a bare row failed", () => {
    expect(
      summaryOf(
        entry({ action: "auth.password_change", entity: "session", entityLabel: "", result: "failed" }),
      ),
    ).toBe("failed");
  });

  // The catalog rows do label themselves — territory.insert carries the slug
  // in entityLabel, model.insert the model's slug.
  it("names a labelled row as the gateway labelled it", () => {
    expect(
      summaryOf(
        entry({ action: "territory.insert", entity: "territory", entityLabel: "dji-wp-46-cut" }),
      ),
    ).toBe("dji-wp-46-cut");
  });

  it("says a failed action failed, because the row is otherwise identical to a successful one", () => {
    expect(summaryOf(entry({ entityLabel: "Refinery Block C", result: "failed" })))
      .toBe("Refinery Block C · failed");
  });
});

describe("relativeAt", () => {
  const now = new Date("2026-09-07T12:00:00Z");

  it("shows only the clock for today", () => {
    expect(relativeAt("2026-09-07T09:14:00Z", now)).toBe("09:14");
  });

  it("names yesterday", () => {
    expect(relativeAt("2026-09-06T18:20:00Z", now)).toBe("yesterday 18:20");
  });

  it("falls back to a day and month further back", () => {
    expect(relativeAt("2026-09-05T11:37:00Z", now)).toBe("05.09 11:37");
  });

  // Across a month boundary "yesterday" is still yesterday — a day-of-month
  // comparison would call 1 September's events "older" than 31 August's.
  it("crosses a month boundary without losing yesterday", () => {
    expect(relativeAt("2026-08-31T23:50:00Z", new Date("2026-09-01T00:10:00Z"))).toBe("yesterday 23:50");
  });

  it("says nothing rather than NaN when the instant will not parse", () => {
    expect(relativeAt("not-a-date", now)).toBe("—");
  });
});

describe("dayOf", () => {
  it("names the day the mock's way", () => {
    expect(dayOf("2026-08-12T09:20:00Z")).toBe("12 Aug 2026");
  });

  it("says nothing rather than NaN when the instant will not parse", () => {
    expect(dayOf("")).toBe("—");
  });
});
