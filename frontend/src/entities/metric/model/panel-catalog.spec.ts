import { describe, expect, it } from "vitest";
import { ALL_PANELS, formatValue, PANELS, SECTIONS, STAT_IDS, type Unit } from "./panel-catalog";

describe("panel catalogue", () => {
  it("lists every panel once, for the one request that asks for them all", () => {
    expect(ALL_PANELS).toEqual(Object.keys(PANELS));
    expect(ALL_PANELS).toHaveLength(20);
  });

  it("covers every id the gateway registers, once", () => {
    const ids = Object.keys(PANELS).sort();
    expect(ids).toEqual([
      "alerts",
      "domain-auth",
      "domain-conversion-p95",
      "domain-conversions",
      "domain-queue",
      "domain-twofa",
      "domain-upload",
      "red-errors",
      "red-http",
      "red-latency",
      "red-rate",
      "runtime-fds",
      "runtime-gc",
      "runtime-goroutines",
      "runtime-memory",
      "services-up",
      "stat-errors",
      "stat-p99",
      "stat-queue",
      "stat-rps",
    ]);
    const inSections = SECTIONS.flatMap((s) => s.panelIds);
    expect(new Set(inSections).size).toBe(inSections.length);
    // stat-up has left the row and the catalogue with it: the health meter
    // counts services now, and a panel nothing reads is a query nobody wants.
    expect(STAT_IDS).toEqual(["stat-rps", "stat-errors", "stat-p99", "stat-queue"]);
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
    expect(formatValue(0.04, "rps")).toBe("<0.1/s");
    expect(formatValue(0, "rps")).toBe("0/s");
    // Same rule one branch over: stat-errors is a percent and its tone fires
    // on last > 0, so a 0.004% 5xx share must not render a red "Errors: 0%".
    expect(formatValue(0.00004, "percent")).toBe("<0.1%");
    expect(formatValue(0, "percent")).toBe("0%");
  });

  it("keeps formatting boundaries and the runtime fallback", () => {
    for (const value of [null, NaN, Infinity, -Infinity]) {
      expect(formatValue(value, "rps")).toBe("—");
    }
    expect(formatValue(1, "unexpected" as Unit)).toBeUndefined();
    expect(formatValue(null, "unexpected" as Unit)).toBe("—");
    expect(formatValue(0.049, "rps")).toBe("<0.1/s");
    expect(formatValue(0.05, "rps")).toBe("0.1/s");
    expect(formatValue(0.00049, "percent")).toBe("<0.1%");
    expect(formatValue(0.0005, "percent")).toBe("0.1%");
    expect(formatValue(0.999, "seconds")).toBe("999ms");
    expect(formatValue(1, "seconds")).toBe("1s");
    expect(formatValue(1024 ** 3 - 1, "bytes")).toBe("1024 MB");
    expect(formatValue(1024 ** 3, "bytes")).toBe("1 GB");
    expect(formatValue(9.96, "count")).toBe("10");
    expect(formatValue(10.4, "cpm")).toBe("10/min");
    expect(formatValue(10.46, "mbps")).toBe("10.5 MB/s");
  });
});
