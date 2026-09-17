import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openJobStream } from "./job-stream";

class FakeSource {
  static instances: FakeSource[] = [];
  listeners = new Map<string, (e: Event) => void>();
  closed = false;
  url: string;
  // A parameter property would be shorter; erasableSyntaxOnly forbids it.
  constructor(url: string) {
    this.url = url;
    FakeSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.set(type, fn);
  }
  close() {
    this.closed = true;
  }
  frame(type: string, data: string) {
    this.listeners.get(type)?.(new MessageEvent(type, { data }));
  }
  drop() {
    this.listeners.get("error")?.(new Event("error"));
  }
}

const RUNNING = JSON.stringify({ id: "j1", kind: "territory", slug: "t", status: "running", progress: 0.58, stage: "lod-1" });
const FAILED = JSON.stringify({ id: "j1", kind: "territory", slug: "t", status: "failed", errorMessage: "boom" });

const last = () => FakeSource.instances.at(-1)!;

describe("openJobStream", () => {
  beforeEach(() => {
    FakeSource.instances = [];
    vi.stubGlobal("EventSource", FakeSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("subscribes to the job's channel and maps each frame to a TargetJob", () => {
    const onJob = vi.fn();
    openJobStream("j 1", { onJob, onEnd: vi.fn() });
    expect(last().url).toBe("/api/jobs/j%201/events");
    last().frame("job", RUNNING);
    expect(onJob).toHaveBeenCalledWith({ kind: "territory", slug: "t", status: "running", progress: 0.58, stage: "lod-1", errorMessage: null });
  });

  it("closes itself after a terminal frame, reporting finished", () => {
    const onEnd = vi.fn();
    openJobStream("j1", { onJob: vi.fn(), onEnd });
    last().frame("job", FAILED);
    expect(last().closed).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("finished");
  });

  it("reports lost on the gateway's error frame and on a dropped connection, and stays quiet afterwards", () => {
    const onEnd = vi.fn();
    openJobStream("j1", { onJob: vi.fn(), onEnd });
    last().frame("error", JSON.stringify({ code: "not_found", message: "job not found" }));
    expect(last().closed).toBe(true);
    expect(onEnd).toHaveBeenCalledWith("lost");
    last().drop();
    expect(onEnd).toHaveBeenCalledTimes(1);

    openJobStream("j2", { onJob: vi.fn(), onEnd });
    last().drop();
    expect(onEnd).toHaveBeenLastCalledWith("lost");
  });

  it("ignores a malformed frame", () => {
    const onJob = vi.fn();
    const onEnd = vi.fn();
    openJobStream("j1", { onJob, onEnd });
    last().frame("job", "{not json");
    expect(onJob).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(last().closed).toBe(false);
  });

  it("closes without reporting when the caller closes it", () => {
    const onEnd = vi.fn();
    const close = openJobStream("j1", { onJob: vi.fn(), onEnd });
    close();
    expect(last().closed).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("answers a no-op closer where the platform has no EventSource", () => {
    vi.stubGlobal("EventSource", undefined);
    const close = openJobStream("j1", { onJob: vi.fn(), onEnd: vi.fn() });
    expect(() => close()).not.toThrow();
    expect(FakeSource.instances).toHaveLength(0);
  });
});
