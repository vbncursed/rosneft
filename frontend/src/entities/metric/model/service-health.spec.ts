import { describe, expect, it } from "vitest";
import { servicesOf } from "./service-health";

const one = (label: string, v: number, labels: Record<string, string> = {}) => ({
  label,
  points: [{ t: 1, v }],
  labels,
});
const run = (label: string, vs: number[]) => ({ label, points: vs.map((v, t) => ({ t, v })), labels: {} });

describe("servicesOf", () => {
  it("names services from the up panel, reads state from up and errors, samples from the rate", () => {
    const out = servicesOf(
      [one("gateway", 1), one("audit", 0), one("catalog", 1), one("mesh-worker", 0), one("mesh-worker", 1)],
      [
        run(
          "gateway",
          Array.from({ length: 30 }, (_, i) => i),
        ),
        run("catalog", [3, 4]),
      ],
      [one("gateway", 1.2), one("catalog", 0.04), one("mesh-worker", 0)],
      [one("rosneft.catalog.v1.CatalogService", 0.024)],
    );
    expect(out.map((s) => [s.name, s.state, s.latency, s.errors])).toEqual([
      ["gateway", "degraded", "—", "1.2/s"],
      ["audit", "down", "—", "—"],
      ["catalog", "degraded", "24ms", "<0.1/s"],
      ["mesh-worker", "up", "—", "0/s"],
    ]);
    expect(out[0].samples).toHaveLength(18);
    expect(out[0].samples[17]).toBe(29);
    expect(out[0].meta).toBe("29/s · 1.2 errors/s");
    expect(out[1].meta).toBe("scrape failed");
    expect(out[1].samples).toEqual([]);
  });

  it("keeps up-panel order and ignores stale metrics for down replicas", () => {
    expect(
      servicesOf(
        [one("down", 0), one("ready", 0), one("down", 0), one("ready", 1)],
        [run("down", [5, 6]), one("ready", 2), one("only-rate", 1)],
        [one("down", 4), one("ready", 0)],
        [one("down", 0.3), one("ready", 0.2)],
      ),
    ).toEqual([
      { name: "down", state: "down", meta: "scrape failed", samples: [], latency: "—", errors: "—" },
      { name: "ready", state: "up", meta: "2/s · 0 errors/s", samples: [2], latency: "200ms", errors: "0/s" },
    ]);
  });

  it("uses the first exact rate and error series and first case-insensitive latency match", () => {
    expect(
      servicesOf(
        [one("catalog", 1), one("missing", 1)],
        [run("catalog", [1, 2]), one("catalog", 99)],
        [one("catalog", 0.04), one("catalog", 8)],
        [one("ROSNEFT.CATALOG.V1", 1.25), one("catalog", 0.01)],
      ),
    ).toEqual([
      {
        name: "catalog",
        state: "degraded",
        meta: "2/s · <0.1 errors/s",
        samples: [1, 2],
        latency: "1.3s",
        errors: "<0.1/s",
      },
      { name: "missing", state: "up", meta: "— · — errors/s", samples: [], latency: "—", errors: "—" },
    ]);
  });
});
