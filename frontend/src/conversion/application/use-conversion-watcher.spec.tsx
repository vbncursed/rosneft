// Run with: yarn test:spa  (vitest + jsdom).
import { test, beforeEach, vi } from "vitest";
import assert from "node:assert/strict";

const invalidateQueries = vi.fn();
let onUpdateCb: ((job: unknown) => void) | null = null;

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (a: unknown) => invalidateQueries(a) }),
}));
vi.mock("@/conversion/application/use-job-stream", () => ({
  useJobStream: (_id: string | null, onUpdate: (job: unknown) => void) => {
    onUpdateCb = onUpdate;
  },
}));

const { renderHook, act } = await import("@/test-support/render-hook");
const { useConversionWatcher } = await import("./use-conversion-watcher");
type JobKind = import("@/shared/domain/job").JobKind;

const mounted: (() => void)[] = [];
function watch(kind: JobKind, jobId: string | null = "j1") {
  const h = renderHook(() => useConversionWatcher(jobId, "north", kind));
  mounted.push(h.unmount);
  return h;
}
const succeed = () => act(() => onUpdateCb?.({ id: "j1", kind: "territory", slug: "north", status: "succeeded" }));
const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey);

beforeEach(() => {
  invalidateQueries.mockReset().mockResolvedValue(undefined);
  onUpdateCb = null;
  vi.useFakeTimers();
  while (mounted.length) mounted.pop()?.();
});

test("starts pending with a jobId and polling without one", () => {
  assert.equal(watch("territory").result.current.status, "pending");
  assert.equal(watch("territory", null).result.current.status, "polling");
});

test("a territory refresh invalidates the scene bundle", () => {
  watch("territory");
  succeed();
  assert.deepEqual(invalidatedKeys(), [["scene", "north"]]);
});

test("a model refresh invalidates both model queries, not the scene", () => {
  // ["scene", <model-slug>] matches nothing, so invalidating it left the user
  // stuck on the pending screen until a manual reload.
  watch("model");
  succeed();
  assert.deepEqual(invalidatedKeys(), [["model", "north"], ["model-artifacts", "north"]]);
});

test("progress, stage and errors from the stream reach the screen", () => {
  const { result } = watch("territory");
  act(() => onUpdateCb?.({ status: "running", progress: 0.42, stage: "encoding" }));
  assert.equal(result.current.status, "running");
  assert.equal(result.current.progress, 0.42);
  assert.equal(result.current.stage, "encoding");
  act(() => onUpdateCb?.({ status: "failed", errorMessage: "bad zip" }));
  assert.equal(result.current.error, "bad zip");
});

test("a non-terminal update refreshes nothing", () => {
  watch("territory");
  act(() => onUpdateCb?.({ status: "running", progress: 0.5 }));
  assert.equal(invalidateQueries.mock.calls.length, 0);
});

test("without a jobId it polls the entity's own keys every 4s", () => {
  watch("model", null);
  act(() => vi.advanceTimersByTime(4000));
  assert.deepEqual(invalidatedKeys(), [["model", "north"], ["model-artifacts", "north"]]);
  act(() => vi.advanceTimersByTime(4000));
  assert.equal(invalidateQueries.mock.calls.length, 4);
});

test("with a jobId it does not poll — SSE carries the updates", () => {
  watch("territory");
  act(() => vi.advanceTimersByTime(20000));
  assert.equal(invalidateQueries.mock.calls.length, 0);
});

test("unmounting stops the poll", () => {
  const h = watch("territory", null);
  h.unmount();
  act(() => vi.advanceTimersByTime(20000));
  assert.equal(invalidateQueries.mock.calls.length, 0);
});
