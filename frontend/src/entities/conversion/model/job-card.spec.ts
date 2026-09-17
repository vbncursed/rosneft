import { describe, expect, it } from "vitest";
import type { TargetJob } from "./target-job";
import { jobPhrase, sortJobs, toJobCard } from "./job-card";

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory",
  slug: "refinery-block-c",
  status: "running",
  progress: 0.58,
  stage: "lod-1",
  errorMessage: null,
  ...over,
});

const titleOf = (_kind: string, slug: string) =>
  slug === "refinery-block-c" ? "Refinery Block C" : undefined;

describe("jobPhrase", () => {
  it("lowers the stage label's first letter and keeps LOD's case", () => {
    expect(jobPhrase(job())).toBe("building LOD 1");
    expect(jobPhrase(job({ stage: "compressing" }))).toBe("compressing textures");
  });

  it("waits for a report while running with no stage", () => {
    expect(jobPhrase(job({ stage: null }))).toBe("waiting for a report");
  });

  it("waits for a worker while pending", () => {
    expect(jobPhrase(job({ status: "pending", stage: null, progress: null }))).toBe(
      "waiting for a worker",
    );
  });

  it("says where a failure stopped, or that it stopped before the first report", () => {
    expect(jobPhrase(job({ status: "failed", stage: "compressing" }))).toBe(
      "stopped while compressing textures",
    );
    expect(jobPhrase(job({ status: "failed", stage: null }))).toBe(
      "stopped before the first report",
    );
  });
});

describe("toJobCard", () => {
  it("maps a running job to a converting card with a rounded percent and the meta line", () => {
    expect(toJobCard(job(), titleOf)).toEqual({
      kind: "territory",
      slug: "refinery-block-c",
      title: "Refinery Block C",
      href: "/territories/refinery-block-c",
      status: "converting",
      meta: "territory · refinery-block-c · building LOD 1",
      percent: 58,
    });
  });

  it("reads a null progress as 0 and an unknown title as the slug", () => {
    const c = toJobCard(job({ kind: "model", slug: "valve", progress: null, stage: null }), titleOf);
    expect(c).toMatchObject({
      title: "valve",
      href: "/models/valve",
      percent: 0,
      meta: "model · valve · waiting for a report",
    });
  });

  it("maps pending to queued with neither percent nor error", () => {
    const c = toJobCard(job({ status: "pending", progress: null, stage: null }), titleOf);
    expect(c.status).toBe("queued");
    expect(c).not.toHaveProperty("percent");
    expect(c).not.toHaveProperty("error");
  });

  it("maps failed with the worker's message, or the fallback sentence for an empty one", () => {
    expect(toJobCard(job({ status: "failed", errorMessage: "ktx2: bad" }), titleOf).error).toBe(
      "ktx2: bad",
    );
    expect(toJobCard(job({ status: "failed", errorMessage: "" }), titleOf).error).toBe(
      "The worker reported no message.",
    );
  });

  it("encodes the slug in the href", () => {
    expect(toJobCard(job({ slug: "a b" }), titleOf).href).toBe("/territories/a%20b");
  });
});

describe("sortJobs", () => {
  it("orders running, pending, failed, then by slug", () => {
    const out = sortJobs([
      job({ slug: "z", status: "failed" }),
      job({ slug: "b", status: "pending" }),
      job({ slug: "a", status: "failed" }),
      job({ slug: "m" }),
    ]);
    expect(out.map((j) => `${j.status}:${j.slug}`)).toEqual([
      "running:m",
      "pending:b",
      "failed:a",
      "failed:z",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [job({ slug: "z", status: "failed" }), job({ slug: "a" })];
    sortJobs(input);
    expect(input[0].slug).toBe("z");
  });
});
