import { describe, expect, it } from "vitest";
import { progressFor, progressLine } from "./progress-line";

describe("progressLine", () => {
  it("formats the header and the four stat strings", () => {
    const line = progressLine(
      { bytes: 1_539_000_000, total: 2_400_000_000, chunk: 197, chunks: 308 },
      { bytesPerSecond: 24_600_000, etaSeconds: 180 },
    );
    expect(line.header).toBe("64% · 1.4 GB / 2.2 GB · ~3 min");
    expect(line.stats).toEqual(["chunk 197 / 308", "8 MB chunks", "23 MB/s", "resumable"]);
  });

  it("omits the eta segment and shows a dash speed when neither is known yet", () => {
    const line = progressLine(
      { bytes: 0, total: 1_000_000, chunk: 0, chunks: 1 },
      { bytesPerSecond: null, etaSeconds: null },
    );
    expect(line.header).toBe("0% · 0 B / 977 KB");
    expect(line.stats[2]).toBe("—");
  });
});

describe("progressFor", () => {
  const p = { bytes: 500_000, total: 1_000_000, chunk: 1, chunks: 2 };
  const samples = [
    { at: 0, bytes: 0 },
    { at: 1000, bytes: 500_000 },
  ];

  it("shows nothing before there is a byte sample", () => {
    expect(progressFor(true, null, [])).toBeUndefined();
  });

  it("shows nothing while not busy, even mid-progress", () => {
    expect(progressFor(false, p, samples)).toBeUndefined();
  });

  it("computes the panel from the byte progress while busy", () => {
    expect(progressFor(true, p, samples)).toEqual({
      value: 50,
      header: "50% · 488 KB / 977 KB · <1 min",
      stats: ["chunk 1 / 2", "8 MB chunks", "488 KB/s", "resumable"],
    });
  });
});
