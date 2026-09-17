import { describe, expect, it } from "vitest";
import { alertsOf } from "./alerts";

describe("alertsOf", () => {
  it("summarises each alert series by its labels", () => {
    expect(alertsOf([
      { label: "HighErrorRate", points: [{ t: 1, v: 1 }], labels: { alertname: "HighErrorRate", alertstate: "firing", service: "gateway", severity: "critical" } },
      { label: "TargetDown", points: [{ t: 1, v: 1 }], labels: { alertname: "TargetDown", alertstate: "pending", severity: "warning" } },
    ])).toEqual([
      { name: "HighErrorRate", meta: "gateway · severity: critical", state: "firing", service: "gateway", severity: "critical" },
      { name: "TargetDown", meta: "severity: warning", state: "pending", service: "", severity: "warning" },
    ]);
  });

  it("collapses two instances of the same rule into one firing summary", () => {
    expect(alertsOf([
      { label: "ConversionFailures", points: [{ t: 1, v: 1 }], labels: { alertname: "ConversionFailures", alertstate: "firing", instance: "172.18.0.14:9101", service: "mesh-worker", severity: "warning" } },
      { label: "ConversionFailures", points: [{ t: 1, v: 1 }], labels: { alertname: "ConversionFailures", alertstate: "firing", instance: "172.18.0.15:9101", service: "mesh-worker", severity: "warning" } },
    ])).toEqual([
      { name: "ConversionFailures", meta: "mesh-worker · severity: warning · 2 instances", state: "firing", service: "mesh-worker", severity: "warning" },
    ]);
  });

  it("collapses a firing instance and a pending instance of the same rule into one firing summary", () => {
    expect(alertsOf([
      { label: "ConversionFailures", points: [{ t: 1, v: 1 }], labels: { alertname: "ConversionFailures", alertstate: "pending", instance: "172.18.0.14:9101", service: "mesh-worker", severity: "warning" } },
      { label: "ConversionFailures", points: [{ t: 1, v: 1 }], labels: { alertname: "ConversionFailures", alertstate: "firing", instance: "172.18.0.15:9101", service: "mesh-worker", severity: "warning" } },
    ])).toEqual([
      { name: "ConversionFailures", meta: "mesh-worker · severity: warning · 2 instances", state: "firing", service: "mesh-worker", severity: "warning" },
    ]);
  });

  it("keeps two different alert rules as two summaries", () => {
    expect(alertsOf([
      { label: "HighErrorRate", points: [{ t: 1, v: 1 }], labels: { alertname: "HighErrorRate", alertstate: "firing", instance: "a", service: "gateway", severity: "critical" } },
      { label: "TargetDown", points: [{ t: 1, v: 1 }], labels: { alertname: "TargetDown", alertstate: "pending", instance: "b", service: "gateway", severity: "critical" } },
    ])).toEqual([
      { name: "HighErrorRate", meta: "gateway · severity: critical", state: "firing", service: "gateway", severity: "critical" },
      { name: "TargetDown", meta: "gateway · severity: critical", state: "pending", service: "gateway", severity: "critical" },
    ]);
  });
});
