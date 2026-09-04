import { describe, expect, it } from "vitest";
import { formatValue, PANELS, SECTIONS, STAT_IDS } from "./panel-catalog";

describe("panel catalogue", () => {
  it("covers every id the gateway registers, once", () => {
    const ids = Object.keys(PANELS).sort();
    expect(ids).toEqual([
      "alerts", "domain-auth", "domain-conversion-p95", "domain-conversions", "domain-queue", "domain-twofa", "domain-upload",
      "red-errors", "red-http", "red-latency", "red-rate", "runtime-fds", "runtime-gc", "runtime-goroutines", "runtime-memory",
      "services-up", "stat-errors", "stat-p99", "stat-queue", "stat-rps", "stat-up",
    ]);
    const inSections = SECTIONS.flatMap((s) => s.panelIds);
    expect(new Set(inSections).size).toBe(inSections.length);
    expect(STAT_IDS).toEqual(["stat-up", "stat-rps", "stat-errors", "stat-p99", "stat-queue"]);
  });

  it("describes what a panel plots without claiming a count it cannot know", () => {
    expect(PANELS["services-up"].meta).toBe("per scraped target");
  });

  it("formats by unit", () => {
    expect(formatValue(142.3, "rps")).toBe("142/s");
    expect(formatValue(0.0082, "percent")).toBe("0.8%");
    expect(formatValue(0.452, "seconds")).toBe("452ms");
    expect(formatValue(184, "seconds")).toBe("184s");
    expect(formatValue(1.4 * 1024 ** 3, "bytes")).toBe("1.4 GB");
    expect(formatValue(24.6, "mbps")).toBe("24.6 MB/s");
    expect(formatValue(6.2, "cpm")).toBe("6.2/min");
    expect(formatValue(412, "count")).toBe("412");
    expect(formatValue(null, "count")).toBe("—");
  });
});
