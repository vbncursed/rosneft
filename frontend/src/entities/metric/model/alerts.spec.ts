import { describe, expect, it } from "vitest";
import { alertsOf } from "./alerts";

describe("alertsOf", () => {
  it("summarises each alert series by its labels", () => {
    expect(
      alertsOf([
        {
          label: "HighErrorRate",
          points: [{ t: 1, v: 1 }],
          labels: { alertname: "HighErrorRate", alertstate: "firing", service: "gateway", severity: "critical" },
        },
        {
          label: "TargetDown",
          points: [{ t: 1, v: 1 }],
          labels: { alertname: "TargetDown", alertstate: "pending", severity: "warning" },
        },
      ]),
    ).toEqual([
      {
        name: "HighErrorRate",
        meta: "gateway · severity: critical",
        state: "firing",
        service: "gateway",
        severity: "critical",
      },
      { name: "TargetDown", meta: "severity: warning", state: "pending", service: "", severity: "warning" },
    ]);
  });

  it("collapses two instances of the same rule into one firing summary", () => {
    expect(
      alertsOf([
        {
          label: "ConversionFailures",
          points: [{ t: 1, v: 1 }],
          labels: {
            alertname: "ConversionFailures",
            alertstate: "firing",
            instance: "172.18.0.14:9101",
            service: "mesh-worker",
            severity: "warning",
          },
        },
        {
          label: "ConversionFailures",
          points: [{ t: 1, v: 1 }],
          labels: {
            alertname: "ConversionFailures",
            alertstate: "firing",
            instance: "172.18.0.15:9101",
            service: "mesh-worker",
            severity: "warning",
          },
        },
      ]),
    ).toEqual([
      {
        name: "ConversionFailures",
        meta: "mesh-worker · severity: warning · 2 instances",
        state: "firing",
        service: "mesh-worker",
        severity: "warning",
      },
    ]);
  });

  it("collapses a firing instance and a pending instance of the same rule into one firing summary", () => {
    expect(
      alertsOf([
        {
          label: "ConversionFailures",
          points: [{ t: 1, v: 1 }],
          labels: {
            alertname: "ConversionFailures",
            alertstate: "pending",
            instance: "172.18.0.14:9101",
            service: "mesh-worker",
            severity: "warning",
          },
        },
        {
          label: "ConversionFailures",
          points: [{ t: 1, v: 1 }],
          labels: {
            alertname: "ConversionFailures",
            alertstate: "firing",
            instance: "172.18.0.15:9101",
            service: "mesh-worker",
            severity: "warning",
          },
        },
      ]),
    ).toEqual([
      {
        name: "ConversionFailures",
        meta: "mesh-worker · severity: warning · 2 instances",
        state: "firing",
        service: "mesh-worker",
        severity: "warning",
      },
    ]);
  });

  it("keeps two different alert rules as two summaries", () => {
    expect(
      alertsOf([
        {
          label: "HighErrorRate",
          points: [{ t: 1, v: 1 }],
          labels: {
            alertname: "HighErrorRate",
            alertstate: "firing",
            instance: "a",
            service: "gateway",
            severity: "critical",
          },
        },
        {
          label: "TargetDown",
          points: [{ t: 1, v: 1 }],
          labels: {
            alertname: "TargetDown",
            alertstate: "pending",
            instance: "b",
            service: "gateway",
            severity: "critical",
          },
        },
      ]),
    ).toEqual([
      {
        name: "HighErrorRate",
        meta: "gateway · severity: critical",
        state: "firing",
        service: "gateway",
        severity: "critical",
      },
      {
        name: "TargetDown",
        meta: "gateway · severity: critical",
        state: "pending",
        service: "gateway",
        severity: "critical",
      },
    ]);
  });

  it("uses the series label and empty defaults when labels are missing", () => {
    expect(alertsOf([{ label: "Fallback", points: [], labels: {} }])).toEqual([
      { name: "Fallback", meta: "", state: "pending", service: "", severity: "" },
    ]);
  });

  it("counts pending duplicates even when their instances differ", () => {
    expect(
      alertsOf([
        { label: "A", points: [], labels: { instance: "one", alertstate: "pending" } },
        { label: "A", points: [], labels: { instance: "two", alertstate: "pending" } },
      ]),
    ).toEqual([{ name: "A", meta: " · 2 instances", state: "pending", service: "", severity: "" }]);
  });

  it("keeps firing when a pending duplicate follows it", () => {
    expect(
      alertsOf([
        { label: "A", points: [], labels: { alertstate: "firing" } },
        { label: "A", points: [], labels: { alertstate: "pending" } },
      ]),
    ).toEqual([{ name: "A", meta: " · 2 instances", state: "firing", service: "", severity: "" }]);
  });

  it("separates service and severity and retains first-seen rule order", () => {
    expect(
      alertsOf([
        { label: "A", points: [], labels: { service: "b", severity: "warning" } },
        { label: "A", points: [], labels: { service: "a", severity: "warning" } },
        { label: "A", points: [], labels: { service: "b", severity: "critical" } },
        { label: "A", points: [], labels: { service: "b", severity: "warning", instance: "other" } },
      ]),
    ).toEqual([
      { name: "A", meta: "b · severity: warning · 2 instances", state: "pending", service: "b", severity: "warning" },
      { name: "A", meta: "a · severity: warning", state: "pending", service: "a", severity: "warning" },
      { name: "A", meta: "b · severity: critical", state: "pending", service: "b", severity: "critical" },
    ]);
  });

  it("returns no summaries for no series", () => {
    expect(alertsOf([])).toEqual([]);
  });
});
