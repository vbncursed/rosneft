import { describe, expect, it } from "vitest";
import { isOpenable, jobProgress, trailingNote } from "./status";

describe("isOpenable", () => {
  it("opens only a finished conversion", () => {
    expect(isOpenable({ status: "ready" })).toBe(true);
    expect(isOpenable({ status: "converting" })).toBe(false);
    expect(isOpenable({ status: "failed" })).toBe(false);
  });
});

describe("trailingNote", () => {
  it("offers the way in once the scene is ready", () => {
    expect(trailingNote({ status: "ready" })).toBe("Open →");
  });

  it("reports how far along a conversion is", () => {
    expect(trailingNote({ status: "converting", progress: 42 })).toBe("42%");
    expect(trailingNote({ status: "converting", progress: 0 })).toBe("0%");
    expect(trailingNote({ status: "converting", progress: 99.6 })).toBe("100%");
  });

  it("says so plainly when the worker has not reported progress yet", () => {
    expect(trailingNote({ status: "converting" })).toBe("Converting…");
  });

  it("stays silent on failure — the badge already carries that", () => {
    expect(trailingNote({ status: "failed" })).toBeUndefined();
  });

  it("says nothing before a conversion has been asked for", () => {
    expect(trailingNote({ status: "pending" })).toBeUndefined();
  });
});

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
