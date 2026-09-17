import { describe, expect, it } from "vitest";
import { finishedSince, isLive, pollInterval, type TargetJob } from "./target-job";

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory",
  slug: "t",
  status: "running",
  progress: 0.4,
  stage: "parsing",
  errorMessage: null,
  ...over,
});

describe("target jobs", () => {
  it("is live while pending or running, and nothing else", () => {
    expect(isLive(job({ status: "pending" }))).toBe(true);
    expect(isLive(job({ status: "running" }))).toBe(true);
    expect(isLive(job({ status: "failed" }))).toBe(false);
    expect(isLive(job({ status: "succeeded" }))).toBe(false);
  });

  it("polls every five seconds only while something is live", () => {
    expect(pollInterval([job(), job({ slug: "u", status: "failed" })])).toBe(5000);
    expect(pollInterval([job({ status: "failed" })])).toBe(false);
    expect(pollInterval([])).toBe(false);
    expect(pollInterval(undefined)).toBe(false);
  });

  it("names the targets that stopped being live between two answers", () => {
    const prev = [job({ slug: "a" }), job({ slug: "b" }), job({ kind: "model", slug: "m" })];
    const next = [job({ slug: "a", status: "failed" }), job({ kind: "model", slug: "m" })];
    expect(finishedSince(prev, next)).toEqual([
      { kind: "territory", slug: "a" },
      { kind: "territory", slug: "b" },
    ]);
    expect(finishedSince(undefined, next)).toEqual([]);
  });
});
