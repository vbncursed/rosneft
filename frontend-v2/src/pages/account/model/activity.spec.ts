import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditEntry } from "@/entities/audit";
import { dayOf, relativeAt, summaryOf } from "./activity";

// relativeAt prints the reader's *local* clock — an event that happened ten
// minutes ago must not read as yesterday because UTC has already rolled over.
// That makes every expectation below a function of the machine's timezone, so
// the file pins one: UTC, which is what the ISO instants in the fixtures are
// already written in. Without this the whole block passes only on a UTC box
// (this repo's dev machine is UTC+5) — a green CI and a red laptop.
const TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = TZ;
});

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

  it("falls back to the entity when nothing was labelled", () => {
    expect(summaryOf(entry({ action: "auth.login", entity: "session", entityLabel: "" }))).toBe("session");
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
