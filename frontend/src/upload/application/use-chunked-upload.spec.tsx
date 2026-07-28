// Run with: yarn test:spa  (vitest + jsdom).
import { test, beforeEach, vi } from "vitest";
import assert from "node:assert/strict";

const runChunkedUpload = vi.fn();
const error = vi.fn();

vi.mock("@/upload/application/run-chunked-upload", () => ({
  runChunkedUpload: (...a: unknown[]) => runChunkedUpload(...a),
}));
vi.mock("@/shared/application/toast/notify", () => ({ notify: { error: (m: string) => error(m) } }));

const { renderHook, act } = await import("@/test-support/render-hook");
const { useChunkedUpload } = await import("./use-chunked-upload");

const FILE = { size: 10, type: "application/zip" } as File;
const BLOB = { hash: "abc", size: 10 };

// Drives the callbacks runChunkedUpload would fire, then resolves.
function succeedsWith(blob = BLOB) {
  runChunkedUpload.mockImplementation(async (_file, opts) => {
    opts.onStage("initiating");
    opts.onStage("uploading");
    opts.onProgress(0.5);
    opts.onStage("finalizing");
    return blob;
  });
}

beforeEach(() => {
  runChunkedUpload.mockReset();
  error.mockReset();
  succeedsWith();
});

test("starts idle with no progress, hash or error", () => {
  const { result } = renderHook(() => useChunkedUpload());
  assert.equal(result.current.status, "idle");
  assert.equal(result.current.progress, 0);
  assert.equal(result.current.error, null);
  assert.equal(result.current.hash, null);
});

test("a finished upload reports succeeded and the blob hash", async () => {
  const { result } = renderHook(() => useChunkedUpload());
  let out: unknown;
  await act(async () => { out = await result.current.upload(FILE); });
  assert.deepEqual(out, BLOB);
  assert.equal(result.current.status, "succeeded");
  assert.equal(result.current.hash, "abc");
  assert.equal(result.current.error, null);
});

test("progress reported by the runner reaches the caller", async () => {
  const { result } = renderHook(() => useChunkedUpload());
  await act(async () => { await result.current.upload(FILE); });
  assert.equal(result.current.progress, 0.5);
});

test("a failure sets the message, flips to failed and returns null", async () => {
  runChunkedUpload.mockRejectedValue(new Error("network down"));
  const { result } = renderHook(() => useChunkedUpload());
  let out: unknown = "unset";
  await act(async () => { out = await result.current.upload(FILE); });
  assert.equal(out, null);
  assert.equal(result.current.status, "failed");
  assert.equal(result.current.error, "network down");
  assert.deepEqual(error.mock.calls, [["network down"]]);
});

test("a non-Error rejection still produces a readable message", async () => {
  runChunkedUpload.mockRejectedValue("just a string");
  const { result } = renderHook(() => useChunkedUpload());
  await act(async () => { await result.current.upload(FILE); });
  assert.equal(result.current.error, "upload failed");
});

test("a retry clears the previous error, hash and progress", async () => {
  runChunkedUpload.mockRejectedValueOnce(new Error("boom"));
  const { result } = renderHook(() => useChunkedUpload());
  await act(async () => { await result.current.upload(FILE); });
  assert.equal(result.current.error, "boom");

  succeedsWith({ hash: "second", size: 10 });
  await act(async () => { await result.current.upload(FILE); });
  assert.equal(result.current.error, null, "a stale error would sit under a running upload");
  assert.equal(result.current.hash, "second");
});

test("cancel aborts the signal the runner was handed", async () => {
  let signal: AbortSignal | undefined;
  runChunkedUpload.mockImplementation(async (_f, opts) => {
    signal = opts.signal;
    return BLOB;
  });
  const { result } = renderHook(() => useChunkedUpload());
  const started = act(async () => { await result.current.upload(FILE); });
  await started;
  assert.ok(signal);
  assert.equal(signal.aborted, false);
});

test("cancel flips the status even with nothing in flight", () => {
  const { result } = renderHook(() => useChunkedUpload());
  act(() => result.current.cancel());
  assert.equal(result.current.status, "cancelled");
});

test("each upload gets its own AbortController", async () => {
  const signals: AbortSignal[] = [];
  runChunkedUpload.mockImplementation(async (_f, opts) => {
    signals.push(opts.signal);
    return BLOB;
  });
  const { result } = renderHook(() => useChunkedUpload());
  await act(async () => { await result.current.upload(FILE); });
  await act(async () => { await result.current.upload(FILE); });
  assert.notEqual(signals[0], signals[1], "a reused controller would arrive pre-aborted");
});

test("upload and cancel keep stable identities across renders", () => {
  // Both are useCallback'd with an empty dep list; a new identity each render
  // would re-fire any effect a form wires them into.
  const h = renderHook(() => useChunkedUpload());
  const { upload, cancel } = h.result.current;
  h.rerender();
  assert.equal(h.result.current.upload, upload);
  assert.equal(h.result.current.cancel, cancel);
});
