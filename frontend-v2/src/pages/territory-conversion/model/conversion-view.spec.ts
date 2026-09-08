import { describe, expect, it } from "vitest";
import type { TargetJob } from "@/entities/conversion";
import { ledeOf, phaseOf, progressCard, shouldLeave, STATUS_PILL } from "./conversion-view";

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory",
  slug: "t",
  status: "running",
  progress: 0.58,
  stage: "lod-1",
  errorMessage: null,
  ...over,
});

describe("phaseOf", () => {
  it("lets the job outrank the artifacts, then reads queued/running off its status", () => {
    expect(phaseOf(true, job({ status: "failed" }))).toBe("failed");
    expect(phaseOf(false, job({ status: "failed" }))).toBe("failed");
    expect(phaseOf(true, job({ status: "running" }))).toBe("running");
    expect(phaseOf(false, job({ status: "pending" }))).toBe("queued");
  });

  it("falls back to the artifacts with no live job", () => {
    expect(phaseOf(true, undefined)).toBe("ready");
    expect(phaseOf(false, undefined)).toBe("queued");
    expect(phaseOf(true, job({ status: "succeeded" }))).toBe("ready");
    expect(phaseOf(false, job({ status: "succeeded" }))).toBe("queued");
  });
});

describe("shouldLeave", () => {
  it("leaves only on a finish watched from this page", () => {
    expect(shouldLeave("running", "ready")).toBe(true);
    expect(shouldLeave("queued", "ready")).toBe(true);
    expect(shouldLeave(null, "ready")).toBe(false);
    expect(shouldLeave("failed", "ready")).toBe(false);
    expect(shouldLeave("ready", "ready")).toBe(false);
    expect(shouldLeave("running", "failed")).toBe(false);
  });
});

describe("ledeOf", () => {
  it("has a sentence for each of the six rows", () => {
    expect(ledeOf("queued", { hasJob: true, hasLod0: false })).toBe(
      "The archive is uploaded and the job is in the queue. Nothing has been reported yet, so there is no progress to show.",
    );
    expect(ledeOf("queued", { hasJob: false, hasLod0: false })).toBe(
      "The archive is uploaded, but no job has been recorded for it yet. The worker picks such territories up on its own within a few minutes.",
    );
    expect(ledeOf("running", { hasJob: true, hasLod0: false })).toBe(
      "The worker is turning your archive into the compact format the viewer loads. Heavy work happens on the server, not in this tab.",
    );
    expect(ledeOf("failed", { hasJob: true, hasLod0: false })).toBe(
      "Conversion stopped, so the viewer has nothing to open.",
    );
    expect(ledeOf("failed", { hasJob: true, hasLod0: true })).toBe(
      "Conversion stopped, so the viewer has nothing new to open. The previous revision of this territory stays live.",
    );
    expect(ledeOf("ready", { hasJob: false, hasLod0: true })).toBe(
      "The artifacts are in place. The viewer is still the previous app, so opening it leaves this page.",
    );
  });
});

describe("STATUS_PILL", () => {
  it("prints the mock's four words in the mock's tones", () => {
    expect(STATUS_PILL.queued).toEqual({ tone: "neutral", fill: "outline", label: "queued" });
    expect(STATUS_PILL.running).toEqual({ tone: "warn", fill: "soft", label: "converting" });
    expect(STATUS_PILL.failed).toEqual({ tone: "bad", fill: "soft", label: "failed" });
    expect(STATUS_PILL.ready).toEqual({ tone: "ok", fill: "soft", label: "ready" });
  });
});

describe("progressCard", () => {
  it("names the stage and the percent while running", () => {
    expect(progressCard("running", job())).toEqual({ title: "Building LOD 1", detail: "58%", value: 58 });
    expect(progressCard("running", job({ progress: 0 }))).toEqual({ title: "Building LOD 1", detail: "0%", value: 0 });
    expect(progressCard("running", job({ progress: 1 }))).toEqual({ title: "Building LOD 1", detail: "100%", value: 100 });
  });

  it("keeps the stage but drops the bar when progress is unreported", () => {
    expect(progressCard("running", job({ progress: null }))).toEqual({ title: "Building LOD 1", detail: "no progress reported" });
    expect(progressCard("running", job({ progress: null, stage: null })).title).toBe("Starting");
  });

  it("waits for a worker while queued, with or without a record", () => {
    const waiting = { title: "Waiting for a worker", detail: "no progress reported" };
    expect(progressCard("queued", job({ status: "pending", progress: null, stage: null }))).toEqual(waiting);
    expect(progressCard("queued", null)).toEqual(waiting);
  });
});
