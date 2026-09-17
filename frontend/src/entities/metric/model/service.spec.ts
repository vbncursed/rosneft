import { describe, expect, it } from "vitest";
import { healthSummary, isScraped, SERVICE_TONE, type ServiceHealth } from "./service";

const service = (over: Partial<ServiceHealth> = {}): ServiceHealth => ({
  name: "gateway",
  state: "up",
  meta: "142 rps · 3 replicas",
  samples: [1, 2, 3],
  latency: "18ms",
  errors: "0.1/s",
  ...over,
});

describe("SERVICE_TONE", () => {
  it("maps each state to its meaning", () => {
    expect(SERVICE_TONE.up).toBe("ok");
    expect(SERVICE_TONE.degraded).toBe("warn");
    expect(SERVICE_TONE.down).toBe("bad");
  });
});

describe("isScraped", () => {
  it("is false only when the service is not answering", () => {
    expect(isScraped(service())).toBe(true);
    expect(isScraped(service({ state: "degraded" }))).toBe(true);
    expect(isScraped(service({ state: "down" }))).toBe(false);
  });
});

describe("healthSummary", () => {
  it("counts the services and calls out what is down", () => {
    expect(
      healthSummary([service(), service({ state: "down" }), service({ state: "degraded" })]),
    ).toBe("3 services · 1 down");
  });

  it("says nothing about outages when there are none", () => {
    expect(healthSummary([service(), service()])).toBe("2 services");
  });

  it("agrees with itself in number", () => {
    expect(healthSummary([service()])).toBe("1 service");
    expect(healthSummary([])).toBe("0 services");
  });
});
