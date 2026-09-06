import { describe, expect, it } from "vitest";
import { jobProgress, toneClasses } from "./status";

describe("jobProgress", () => {
  it("passes a running job's progress through", () => {
    expect(jobProgress({ id: "1", slug: "t", state: "running", progress: 62, stage: "…", eta: "~4 min" })).toBe(62);
  });

  it("fills the bar for a failed job — it got as far as it will get", () => {
    expect(jobProgress({ id: "1", slug: "t", state: "failed", progress: 18, stage: "…", eta: "—" })).toBe(100);
  });

  it("stays indeterminate before the worker reports anything", () => {
    expect(jobProgress({ id: "1", slug: "t", state: "queued", stage: "…", eta: "—" })).toBeUndefined();
  });
});

describe("toneClasses", () => {
  it("tones a done or pending stage the same regardless of activeTone", () => {
    expect(toneClasses("done", "accent")).toEqual({ dot: "bg-ok", text: "text-fg" });
    expect(toneClasses("pending", "accent")).toEqual({ dot: "bg-line-2", text: "text-dim" });
  });

  it("tones the active stage warn by default", () => {
    expect(toneClasses("active")).toEqual({ dot: "bg-warn", text: "text-warn" });
  });

  it("tones the active stage accent when asked", () => {
    expect(toneClasses("active", "accent")).toEqual({ dot: "bg-accent", text: "text-accent" });
  });
});
