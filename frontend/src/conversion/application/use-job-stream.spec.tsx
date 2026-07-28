// Run with: yarn test:spa  (vitest + jsdom — jsdom has no EventSource, so the
// suite installs a fake that records what the hook does to it).
import { test, beforeEach, afterEach, vi } from "vitest";
import assert from "node:assert/strict";

import { renderHook, act } from "@/test-support/render-hook";
import { useJobStream } from "./use-job-stream";
import type { Job } from "@/shared/domain/job";

class FakeEventSource {
  static opened: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<EventListener>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }
  addEventListener(type: string, fn: EventListener) {
    (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(fn);
  }
  removeEventListener(type: string, fn: EventListener) {
    this.listeners.get(type)?.delete(fn);
  }
  close() {
    this.closed = true;
  }
  emit(data: string) {
    act(() => {
      for (const fn of this.listeners.get("job") ?? []) fn({ data } as MessageEvent<string>);
    });
  }
}

const JOB = {
  id: "j1", kind: "territory", slug: "north", status: "running",
  progress: 0.4, stage: "encoding", createdAt: "t0", updatedAt: "t1",
};

const mounted: (() => void)[] = [];
function subscribe(jobId: string | null, onUpdate: (j: Job) => void) {
  const h = renderHook(() => useJobStream(jobId, onUpdate));
  mounted.push(h.unmount);
  return h;
}
const latest = () => FakeEventSource.opened.at(-1)!;

beforeEach(() => {
  FakeEventSource.opened = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
});

test("opens the job's SSE channel on the gateway", () => {
  subscribe("j1", () => {});
  assert.equal(latest().url, "http://localhost:8080/api/jobs/j1/events");
});

test("percent-encodes the job id into the path", () => {
  subscribe("a/b", () => {});
  assert.equal(latest().url, "http://localhost:8080/api/jobs/a%2Fb/events");
});

test("a null job id opens nothing", () => {
  subscribe(null, () => {});
  assert.equal(FakeEventSource.opened.length, 0);
});

test("a job frame is mapped into a domain Job", () => {
  const seen: Job[] = [];
  subscribe("j1", (j) => seen.push(j));
  latest().emit(JSON.stringify(JOB));
  assert.deepEqual(seen, [{ ...JOB, errorMessage: undefined, artifactHash: undefined }]);
});

test("every status change is dispatched", () => {
  const seen: Job[] = [];
  subscribe("j1", (j) => seen.push(j));
  latest().emit(JSON.stringify({ ...JOB, status: "pending" }));
  latest().emit(JSON.stringify({ ...JOB, status: "running" }));
  assert.deepEqual(seen.map((j) => j.status), ["pending", "running"]);
});

test("the stream closes once the job succeeds", () => {
  subscribe("j1", () => {});
  latest().emit(JSON.stringify({ ...JOB, status: "succeeded", artifactHash: "h" }));
  assert.equal(latest().closed, true);
});

test("the stream closes on failure too, carrying the error message", () => {
  const seen: Job[] = [];
  subscribe("j1", (j) => seen.push(j));
  latest().emit(JSON.stringify({ ...JOB, status: "failed", errorMessage: "bad zip" }));
  assert.equal(seen[0].errorMessage, "bad zip");
  assert.equal(latest().closed, true);
});

test("a running job keeps the stream open", () => {
  subscribe("j1", () => {});
  latest().emit(JSON.stringify(JOB));
  assert.equal(latest().closed, false);
});

test("a malformed frame is ignored instead of throwing through the listener", () => {
  const seen: Job[] = [];
  subscribe("j1", (j) => seen.push(j));
  latest().emit("not json{");
  assert.deepEqual(seen, []);
  assert.equal(latest().closed, false, "one bad frame must not kill the subscription");
});

test("unmounting closes the stream", () => {
  const h = subscribe("j1", () => {});
  const source = latest();
  h.unmount();
  assert.equal(source.closed, true);
  assert.equal(source.listeners.get("job")?.size, 0);
});

test("a changed job id resubscribes to the new channel and drops the old", () => {
  let jobId = "j1";
  const cb = () => {};
  const h = renderHook(() => useJobStream(jobId, cb));
  mounted.push(h.unmount);
  const first = latest();
  jobId = "j2";
  h.rerender();
  assert.equal(first.closed, true);
  assert.equal(latest().url.endsWith("/j2/events"), true);
});

test("a stable callback does not churn the subscription across renders", () => {
  // onUpdate is an effect dependency: an inline arrow from the caller would
  // reopen the EventSource on every render.
  const cb = () => {};
  const h = renderHook(() => useJobStream("j1", cb));
  mounted.push(h.unmount);
  h.rerender();
  assert.equal(FakeEventSource.opened.length, 1);
});
