import { describe, expect, it } from "vitest";
import type { AlertSummary, MetricSeries, ServiceHealth } from "@/entities/metric";
import {
  alertDetails,
  matchesPanel,
  matchesSection,
  matchesService,
  panelEntry,
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
      series: [
        { label: "gateway", values: [0.4, 1.6] },
        { label: "mesh", values: [0.2, null] },
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
});

describe("statsOf", () => {
  const results = (over: Partial<Record<string, PanelResult>> = {}) =>
    ({
      "stat-up": { kind: "value", series: [series("up", 3)] },
      "stat-rps": { kind: "value", series: [series("rps", 142)] },
      "stat-errors": { kind: "value", series: [series("errors", 0.008)] },
      "stat-p99": { kind: "value", series: [series("p99", 0.452)] },
      "stat-queue": { kind: "value", series: [series("queue", 0)] },
      ...over,
    }) as Parameters<typeof statsOf>[0];

  it("draws the five headline tiles, each with what it counts", () => {
    expect(statsOf(results(), 4)).toEqual([
      { label: "Up", value: "3", hint: "of 4 services" },
      { label: "Requests", value: "142/s", hint: "per second · all HTTP" },
      { label: "Errors", value: "0.8%", hint: "5xx share of HTTP", tone: "bad" },
      { label: "p99", value: "452ms", hint: "gRPC handling" },
      { label: "Queue", value: "0", hint: "conversion jobs waiting" },
    ]);
  });

  it("counts nothing it does not know — no service count, no denominator", () => {
    expect(statsOf(results(), null)[0].hint).toBe("services answering");
  });

  it("leaves a clean error rate untoned", () => {
    const errors = { kind: "value", series: [series("errors", 0)] } satisfies PanelResult;
    expect(statsOf(results({ "stat-errors": errors }), 4)[2]).toEqual({
      label: "Errors",
      value: "0%",
      hint: "5xx share of HTTP",
    });
  });

  it("prints a dash for a tile that failed and an ellipsis for one still loading", () => {
    const stats = statsOf(
      results({
        "stat-errors": { kind: "unavailable", message: "Prometheus unreachable" },
        "stat-queue": { kind: "loading" },
      }),
      4,
    );
    expect(stats[2].value).toBe("—");
    expect(stats[2].tone).toBeUndefined();
    expect(stats[4].value).toBe("…");
  });

  it("prints an ellipsis for a tile whose query has not been made yet", () => {
    expect(statsOf({}, 4).map((s) => s.value)).toEqual(["…", "…", "…", "…", "…"]);
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
