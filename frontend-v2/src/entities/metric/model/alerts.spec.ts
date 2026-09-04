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
});
