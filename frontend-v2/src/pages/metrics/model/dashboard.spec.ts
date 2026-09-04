import { describe, expect, it } from "vitest";
import type { AlertSummary, MetricSeries, ServiceHealth } from "@/entities/metric";
import {
  alertDetails,
  matchesPanel,
  matchesSection,
  matchesService,
  panelEntry,
  servicesHint,
  statsOf,
  type PanelResult,
} from "./dashboard";

const service = (over: Partial<ServiceHealth> = {}): ServiceHealth => ({
  name: "gateway",
  state: "up",
  meta: "142/s · 0 errors/s",
  samples: [1, 2, 3],
  latency: "18ms",
  errors: "0/s",
  ...over,
});

const series = (label: string, ...values: number[]): MetricSeries => ({
  label,
  points: values.map((v, i) => ({ t: i, v })),
  labels: {},
});

const gap = (label: string, ...points: [number, number][]): MetricSeries => ({
  label,
  points: points.map(([t, v]) => ({ t, v })),
  labels: {},
});

const alert = (over: Partial<AlertSummary> = {}): AlertSummary => ({
  name: "TargetDown",
  meta: "audit · severity: critical",
  state: "firing",
  service: "audit",
  severity: "critical",
  ...over,
});

describe("matchesService", () => {
  it("matches a service:chip against part of the name", () => {
    expect(matchesService(service(), "service:gate")).toBe(true);
    expect(matchesService(service({ name: "mesh-worker" }), "service:gate")).toBe(false);
  });

  it("matches state: only against that state", () => {
    expect(matchesService(service({ state: "down" }), "state:down")).toBe(true);
    expect(matchesService(service({ state: "up" }), "state:down")).toBe(false);
  });

  it("matches nothing under a key the list cannot answer", () => {
    expect(matchesService(service(), "entity:territory")).toBe(false);
  });

  it("ignores free text — the health list is filtered by its own keys", () => {
    expect(matchesService(service(), "latency")).toBe(true);
    expect(matchesService(service({ name: "audit" }), "latency")).toBe(true);
  });

  it("leaves the whole list alone when a group: chip is all that was typed", () => {
    expect(matchesService(service(), "group:red")).toBe(true);
  });
});

describe("matchesSection", () => {
  it("keeps only the named group", () => {
    expect(matchesSection({ key: "red" }, "group:red")).toBe(true);
    expect(matchesSection({ key: "domain" }, "group:red")).toBe(false);
  });

  it("keeps every section when no group: chip was typed", () => {
    expect(matchesSection({ key: "go" }, "service:gateway latency")).toBe(true);
    expect(matchesSection({ key: "go" }, "")).toBe(true);
  });
});

describe("matchesPanel", () => {
  it("searches the title by free text, case-insensitively", () => {
    expect(matchesPanel("Latency p99 by service", "latency")).toBe(true);
    expect(matchesPanel("Requests by service", "latency")).toBe(false);
  });

  it("does not narrow panels by a service: chip", () => {
    expect(matchesPanel("Requests by service", "service:gateway")).toBe(true);
  });
});

describe("panelEntry", () => {
  it("prints the panel's own title, meta and latest reading, aligned on one axis", () => {
    expect(
      panelEntry("red-errors", {
        kind: "value",
        series: [series("gateway", 0.4, 1.6), series("mesh", 0.2)],
      }),
    ).toEqual({
      key: "red-errors",
      title: "Errors by service",
      meta: "rps · non-OK gRPC",
      unit: "rps",
      last: "1.6/s",
      lastTone: "bad",
      // red-errors is rate-backed: a window with no errors is a zero, not a
      // scrape the chart should break the line for.
      series: [
        { label: "gateway", values: [0.4, 1.6] },
        { label: "mesh", values: [0.2, 0] },
      ],
    });
  });

  it("leaves a healthy panel untoned", () => {
    const entry = panelEntry("red-rate", { kind: "value", series: [series("gateway", 142)] });
    expect(entry.last).toBe("142/s");
    expect(entry.lastTone).toBeUndefined();
  });

  it("turns a failed panel into one dark card carrying the gateway's sentence", () => {
    expect(panelEntry("red-http", { kind: "unavailable", message: "Prometheus unreachable" })).toEqual({
      key: "red-http",
      title: "HTTP requests",
      meta: "unavailable — Prometheus unreachable",
      unit: "rps",
      last: "—",
      lastTone: "bad",
      series: [],
    });
  });

  it("says a panel is still coming rather than that it has nothing", () => {
    const entry = panelEntry("red-http", { kind: "loading" });
    expect(entry.last).toBe("…");
    expect(entry.series).toEqual([]);
    expect(entry.meta).toBe("rps · gateway");
  });

  it("says a gRPC panel with no traffic is quiet, not broken", () => {
    expect(panelEntry("red-rate", { kind: "value", series: [] })).toEqual({
      key: "red-rate",
      title: "Requests by service",
      meta: "no gRPC traffic in range",
      unit: "rps",
      last: "—",
      lastTone: "dim",
      series: [],
    });
  });

  it("keeps the red wording for a gRPC panel that failed", () => {
    const entry = panelEntry("red-rate", { kind: "unavailable", message: "Prometheus unreachable" });
    expect(entry.meta).toBe("unavailable — Prometheus unreachable");
    expect(entry.lastTone).toBe("bad");
  });

  it("leaves an empty panel outside the gRPC group saying what it always said", () => {
    const entry = panelEntry("runtime-memory", { kind: "value", series: [] });
    expect(entry.meta).toBe("bytes · by service");
    expect(entry.last).toBe("—");
    expect(entry.lastTone).toBeUndefined();
  });

  it("shortens gRPC method legends, and only in the gRPC group", () => {
    const path = "/rosneft.catalog.v1.CatalogService/ListTerritories";
    expect(panelEntry("red-rate", { kind: "value", series: [series(path, 3)] }).series[0].label).toBe(
      "Catalog.ListTerritories",
    );
    expect(
      panelEntry("runtime-memory", { kind: "value", series: [series(path, 3)] }).series[0].label,
    ).toBe(path);
  });

  it("fills a rate panel's gap with zero — no traffic is a zero, not a missed scrape", () => {
    const entry = panelEntry("red-rate", {
      kind: "value",
      series: [gap("gateway", [0, 1], [2, 3]), gap("mesh", [1, 5])],
    });
    expect(entry.series).toEqual([
      { label: "gateway", values: [1, 0, 3] },
      { label: "mesh", values: [0, 5, 0] },
    ]);
  });

  it("keeps a gauge's gap as a break in the line", () => {
    const entry = panelEntry("domain-queue", {
      kind: "value",
      series: [gap("depth", [0, 1], [2, 3]), gap("other", [1, 5])],
    });
    expect(entry.series).toEqual([
      { label: "depth", values: [1, null, 3] },
      { label: "other", values: [null, 5, null] },
    ]);
  });

  it("narrows a per-service panel to the selected service", () => {
    const named = (name: string, v: number): MetricSeries => ({
      label: name,
      labels: { service: name },
      points: [{ t: 0, v }],
    });
    const all = [named("gateway", 1), named("mesh", 2), named("auth", 3), named("audit", 4)];
    expect(panelEntry("runtime-memory", { kind: "value", series: all }, "mesh").series).toEqual([
      { label: "mesh", values: [2] },
    ]);
  });

  it("counts what it left off the chart rather than dropping it silently", () => {
    const named = (name: string, v: number): MetricSeries => ({
      label: name,
      labels: { service: name },
      points: [{ t: 0, v }],
    });
    const entry = panelEntry("runtime-memory", {
      kind: "value",
      series: [named("a", 1), named("b", 2), named("c", 3), named("d", 4), named("e", 5)],
    });
    expect(entry.meta).toBe("bytes · by service · +2 more");
    expect(entry.series).toHaveLength(3);
  });
});

describe("statsOf", () => {
  const results = (over: Partial<Record<string, PanelResult>> = {}) =>
    ({
      "stat-rps": { kind: "value", series: [series("rps", 142)] },
      "stat-errors": { kind: "value", series: [series("errors", 0.008)] },
      "stat-p99": { kind: "value", series: [series("p99", 0.452)] },
      "stat-queue": { kind: "value", series: [series("queue", 0)] },
      ...over,
    }) as Parameters<typeof statsOf>[0];

  it("draws the four headline tiles, each with what it counts", () => {
    expect(statsOf(results())).toEqual([
      { label: "Requests", state: { kind: "value", value: "142/s" }, hint: "per second · all HTTP" },
      {
        label: "Errors",
        state: { kind: "value", value: "0.8%" },
        hint: "5xx share of HTTP",
        tone: "bad",
      },
      { label: "p99", state: { kind: "value", value: "452ms" }, hint: "gRPC handling" },
      { label: "Queue", state: { kind: "value", value: "0" }, hint: "conversion jobs waiting" },
    ]);
  });

  it("counts services in the meter, not in a tile — Up has left the row", () => {
    expect(statsOf(results()).map((s) => s.label)).not.toContain("Up");
  });

  it("leaves a clean error rate untoned", () => {
    const errors = { kind: "value", series: [series("errors", 0)] } satisfies PanelResult;
    expect(statsOf(results({ "stat-errors": errors }))[1]).toEqual({
      label: "Errors",
      state: { kind: "value", value: "0%" },
      hint: "5xx share of HTTP",
    });
  });

  it("says a failed tile is unavailable and a pending one is loading, in words", () => {
    const stats = statsOf(
      results({
        "stat-errors": { kind: "unavailable", message: "Prometheus unreachable" },
        "stat-queue": { kind: "loading" },
      }),
    );
    expect(stats[1].state).toEqual({ kind: "unavailable" });
    expect(stats[1].tone).toBeUndefined();
    expect(stats[3].state).toEqual({ kind: "loading" });
  });

  it("calls a tile whose query has not been made yet loading", () => {
    expect(statsOf({}).map((s) => s.state)).toEqual([
      { kind: "loading" },
      { kind: "loading" },
      { kind: "loading" },
      { kind: "loading" },
    ]);
  });
});

describe("servicesHint", () => {
  it("blames the panel, not a filter, and says nothing when the panel answered", () => {
    expect(servicesHint({ kind: "unavailable", message: "Prometheus unreachable" })).toBe(
      "Service health is unavailable: Prometheus unreachable",
    );
    expect(servicesHint({ kind: "loading" })).toBe("Service health is still loading.");
    expect(servicesHint(undefined)).toBe("Service health is still loading.");
    expect(servicesHint({ kind: "value", series: [] })).toBeUndefined();
  });
});

describe("alertDetails", () => {
  it("names the alert, its service, its severity and its state", () => {
    expect(alertDetails(alert())).toEqual([
      { label: "Alert", value: "TargetDown" },
      { label: "Service", value: "audit" },
      { label: "Severity", value: "critical" },
      { label: "State", value: "firing", tone: "bad" },
    ]);
  });

  it("dashes a label the alert does not carry, and tones a pending one apart", () => {
    expect(alertDetails(alert({ service: "", severity: "", state: "pending" }))).toEqual([
      { label: "Alert", value: "TargetDown" },
      { label: "Service", value: "—", tone: "dim" },
      { label: "Severity", value: "—", tone: "dim" },
      { label: "State", value: "pending", tone: "warn" },
    ]);
  });
});
