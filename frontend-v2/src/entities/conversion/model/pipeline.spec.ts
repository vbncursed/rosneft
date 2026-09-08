import { describe, expect, it } from "vitest";
import { PIPELINE, pipelineMeta, pipelineSteps, stepIndexOf } from "./pipeline";

const TOKENS = ["fetching", "extracting", "parsing", "encoding", "compressing", "lod-0", "lod-1", "lod-2", "lod-7", "registering"];

describe("stepIndexOf", () => {
  it("maps every worker token onto its step, every lod-N onto the LOD step", () => {
    expect(TOKENS.map(stepIndexOf)).toEqual([0, 1, 2, 3, 4, 5, 5, 5, 5, 6]);
  });

  it("answers -1 for nothing reported or a token it does not know", () => {
    expect(stepIndexOf(null)).toBe(-1);
    expect(stepIndexOf("polishing")).toBe(-1);
  });
});

describe("pipelineSteps", () => {
  const states = (stage: string | null, phase: Parameters<typeof pipelineSteps>[1]) =>
    pipelineSteps(stage, phase).map((s) => s.state);

  it("queued: nothing started, whatever the stage says", () => {
    expect(states(null, "queued")).toEqual(Array(7).fill("pending"));
    expect(states("fetching", "queued")).toEqual(Array(7).fill("pending"));
  });

  it("running at a known stage: done before it, active at it, pending after", () => {
    expect(states("encoding", "running")).toEqual(["done", "done", "done", "active", "pending", "pending", "pending"]);
  });

  it("running with nothing reported: all pending", () => {
    expect(states(null, "running")).toEqual(Array(7).fill("pending"));
  });

  it("failed at a known stage marks that step failed", () => {
    expect(states("lod-1", "failed")).toEqual(["done", "done", "done", "done", "done", "failed", "pending"]);
  });

  it("failed with no stage marks nothing — the live shape of tenant-a-scene", () => {
    expect(states(null, "failed")).toEqual(Array(7).fill("pending"));
  });

  it("ready: every step done", () => {
    expect(states(null, "ready")).toEqual(Array(7).fill("done"));
  });

  it("carries the label and the shown token", () => {
    expect(PIPELINE).toHaveLength(7);
    expect(pipelineSteps(null, "queued")[5]).toEqual({ token: "lod-N", label: "Building LODs", state: "pending" });
    expect(pipelineSteps(null, "queued")[0].label).toBe("Fetching the archive");
  });
});

describe("pipelineMeta", () => {
  it("names where the pipeline has got to", () => {
    expect(pipelineMeta(null, "queued")).toBe("7 steps · none started");
    expect(pipelineMeta("encoding", "running")).toBe("step 4 of 7");
    expect(pipelineMeta(null, "running")).toBe("7 steps · stage not reported");
    expect(pipelineMeta("compressing", "failed")).toBe("stopped at step 5 of 7");
    expect(pipelineMeta(null, "failed")).toBe("stopped before the first report");
    expect(pipelineMeta("registering", "ready")).toBe("7 steps · finished");
  });
});
