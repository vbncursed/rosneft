import { describe, expect, it } from "vitest";
import { WINDOW_LIMIT, type AuditEntry } from "@/entities/audit";
import {
  activityOf,
  backwardsRange,
  countersOf,
  entityHref,
  groupByDay,
  inspectorDetails,
  parseAuditFilters,
  rangeChip,
  summaryOf,
  windowStart,
} from "./journal";

const NOW = new Date("2026-09-01T10:30:00Z");
const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  at: "2026-09-01T09:14:00Z",
  actorId: "u-1",
  actorLogin: "a.ivanova",
  companyId: "c-1",
  companyLogin: "cotest",
  action: "territory.update",
  entity: "territory",
  entityId: "t-1",
  entityLabel: "refinery",
  territorySlug: "",
  oldRow: { title: "Old", x: 1 },
  newRow: { title: "New", x: 2 },
  result: "ok",
  ...over,
});
const ACTORS = [
  { id: "u-1", login: "a.ivanova" },
  { id: "u-2", login: "" },
];

describe("parseAuditFilters", () => {
  it("passes entity and action through, resolves an actor login, widens dates, ignores the rest", () => {
    expect(
      parseAuditFilters(
        "entity:territory action:territory.update actor:a.ivanova from:2026-09-01 to:2026-09-02 colour:blue free text",
        ACTORS,
      ),
    ).toEqual({
      filters: {
        entity: "territory",
        action: "territory.update",
        actor: "u-1",
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-02T23:59:59Z",
      },
      unknownActor: null,
    });
    expect(parseAuditFilters("", ACTORS)).toEqual({ filters: {}, unknownActor: null });
  });

  it("names an actor nobody has, and sends nothing for them", () => {
    expect(parseAuditFilters("actor:ghost", ACTORS)).toEqual({ filters: {}, unknownActor: "ghost" });
  });

  it("takes the picked range when no token names a bound, and lets a token win", () => {
    expect(parseAuditFilters("", ACTORS, { from: "2026-09-01", to: "" }).filters).toEqual({
      from: "2026-09-01T00:00:00Z",
    });
    expect(
      parseAuditFilters("to:2026-09-03", ACTORS, { from: "2026-09-01", to: "2026-09-02" }).filters,
    ).toEqual({ from: "2026-09-01T00:00:00Z", to: "2026-09-03T23:59:59Z" });
  });
});

describe("backwardsRange", () => {
  it("is a range that ends before it starts — and needs both bounds to be one", () => {
    expect(backwardsRange({ from: "2026-09-02", to: "2026-09-01" })).toBe(true);
    expect(backwardsRange({ from: "2026-09-01", to: "2026-09-01" })).toBe(false);
    expect(backwardsRange({ from: "2026-09-01", to: "2026-09-02" })).toBe(false);
    expect(backwardsRange({ from: "2026-09-02", to: "" })).toBe(false);
    expect(backwardsRange({})).toBe(false);
  });
});

describe("rangeChip", () => {
  it("says a range ends before it starts rather than wording it as a span", () => {
    expect(rangeChip({ from: "2026-08-24", to: "2026-08-18" })).toBe("24 Aug > 18 Aug");
  });

  it("words the picked range, or nothing when nothing is picked", () => {
    expect(rangeChip({ from: "2026-09-01", to: "2026-09-02" })).toBe("1 Sep – 2 Sep");
    expect(rangeChip({ from: "2026-09-01", to: "" })).toBe("from 1 Sep");
    expect(rangeChip({ from: "", to: "2026-09-02" })).toBe("until 2 Sep");
    expect(rangeChip({ from: "", to: "" })).toBeNull();
  });
});

describe("groupByDay", () => {
  it("labels today, yesterday and older days, newest first, in UTC dates", () => {
    const days = groupByDay(
      [
        entry({ id: 3, at: "2026-09-01T09:14:00Z" }),
        entry({ id: 2, at: "2026-08-31T22:00:00Z" }),
        entry({ id: 4, at: "2026-08-03T08:00:00Z" }),
        entry({ id: 1, at: "2025-12-24T10:00:00Z" }),
      ],
      NOW,
    );
    expect(days.map((d) => [d.key, d.label, d.events.map((e) => e.entry.id)])).toEqual([
      ["2026-09-01", "Today · 1 September", [3]],
      ["2026-08-31", "Yesterday · 31 August", [2]],
      ["2026-08-03", "3 August", [4]],
      ["2025-12-24", "24 December 2025", [1]],
    ]);
    expect(days[0].total).toBeUndefined();
  });
});

describe("summaryOf", () => {
  it("says what moved in one line", () => {
    expect(summaryOf(entry())).toBe("2 fields changed");
    expect(summaryOf(entry({ newRow: { title: "New", x: 1 } }))).toBe("1 field changed");
    expect(summaryOf(entry({ action: "placement.insert" }))).toBe("created");
    expect(summaryOf(entry({ action: "model.delete" }))).toBe("deleted");
    expect(summaryOf(entry({ action: "auth.login", entity: "session" }))).toBe("login");
    expect(summaryOf(entry({ result: "failed" }))).toBe("failed");
  });
});

describe("activityOf and countersOf", () => {
  it("buckets the last 24 hours oldest first and dims the running hour", () => {
    const a = activityOf(
      [
        entry({ at: "2026-09-01T10:05:00Z" }),
        entry({ at: "2026-09-01T10:20:00Z" }),
        entry({ at: "2026-08-31T11:30:00Z" }),
        // Older than the first bucket: the window query is rounded to the hour
        // and may return a little more than the strip plots.
        entry({ at: "2026-08-30T09:00:00Z" }),
      ],
      NOW,
      false,
    );
    expect(a.values).toHaveLength(24);
    expect(a.values.reduce((n, v) => n + v, 0)).toBe(3);
    expect(a.values[23]).toBe(2);
    expect(a.values[0]).toBe(1);
    expect(a.dimFrom).toBe(23);
    expect(a.label).toBe("Events · last 24h (UTC)");
    expect(a.detail).toBe("peak 2/h at 10:00");
    // The strip, the counter and the query the window asked for must quote
    // one number, or the journal states a limit it did not use.
    expect(activityOf([], NOW, true).detail).toBe(`from ${WINDOW_LIMIT} loaded events`);
  });

  it("says there were no events rather than a peak of zero", () => {
    expect(activityOf([], NOW, false).detail).toBe("no events in the last 24h");
  });

  it("counts events and failures in the window and the actors the journal knows", () => {
    expect(countersOf([entry(), entry({ result: "failed" })], NOW, false, 9)).toEqual([
      { label: "Events · 24h", value: "2" },
      { label: "Failed · 24h", value: "1", tone: "bad" },
      { label: "Actors", value: "9", tone: "accent" },
    ]);
    expect(countersOf([], NOW, true, 0)[0].value).toBe(`${WINDOW_LIMIT}+`);
    expect(countersOf([], NOW, false, 0)[1]).toEqual({ label: "Failed · 24h", value: "0" });
  });

  it("counts the same 24 buckets the strip draws — not the 25th hour the query may return", () => {
    const entries = [
      entry({ at: "2026-09-01T10:05:00Z" }),
      entry({ at: "2026-08-31T11:30:00Z", result: "failed" }),
      entry({ at: "2026-08-31T10:30:00Z", result: "failed" }), // rounded-down window start: outside the strip
    ];
    expect(countersOf(entries, NOW, false, 9)).toEqual([
      { label: "Events · 24h", value: "2" },
      { label: "Failed · 24h", value: "1", tone: "bad" },
      { label: "Actors", value: "9", tone: "accent" },
    ]);
  });
});

describe("inspectorDetails and entityHref", () => {
  it("lists actor, at, company, territory and result, dashes when unknown", () => {
    expect(inspectorDetails(entry({ territorySlug: "yard", result: "failed" }))).toEqual([
      { label: "Actor", value: "a.ivanova" },
      { label: "At", value: "2026-09-01 09:14" },
      { label: "Company", value: "cotest" },
      { label: "Territory", value: "yard" },
      { label: "Result", value: "failed", tone: "bad" },
    ]);
    expect(
      inspectorDetails(entry({ actorId: "", actorLogin: "", companyId: "", companyLogin: "" })),
    ).toMatchObject([
      { value: "system" },
      {},
      { value: "—", tone: "dim" },
      { value: "—", tone: "dim" },
      { value: "ok", tone: "ok" },
    ]);
  });

  it("links a territory or model that still exists, and nothing else", () => {
    expect(entityHref(entry())).toBe("/territories/refinery");
    expect(entityHref(entry({ entity: "model", entityLabel: "pump" }))).toBe("/models/pump");
    expect(entityHref(entry({ action: "territory.delete" }))).toBeNull();
    expect(entityHref(entry({ entity: "placement" }))).toBeNull();
    expect(entityHref(entry({ entityLabel: "" }))).toBeNull();
  });
});

describe("windowStart", () => {
  it("is 24 hours before the running hour, so a long-open tab does not drift", () => {
    expect(windowStart(NOW)).toBe("2026-08-31T10:00:00.000Z");
    expect(windowStart(new Date("2026-09-01T10:59:59Z"))).toBe("2026-08-31T10:00:00.000Z");
  });
});
