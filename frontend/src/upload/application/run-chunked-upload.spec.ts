// Run with: yarn test:spa  (vitest — mocks the gateway module the runner
// drives, and resolves it through the `@/` alias).
import { test, beforeEach, vi } from "vitest";
import assert from "node:assert/strict";

const initiateUpload = vi.fn();
const appendChunk = vi.fn();
const finalizeUpload = vi.fn();

vi.mock("@/upload/infrastructure/upload-gateway", () => ({
  initiateUpload: (...a: unknown[]) => initiateUpload(...a),
  appendChunk: (...a: unknown[]) => appendChunk(...a),
  finalizeUpload: (...a: unknown[]) => finalizeUpload(...a),
}));

const { runChunkedUpload } = await import("./run-chunked-upload");

const MB = 1024 * 1024;
const CHUNK = 8 * MB;

// A File stand-in: size and slice are all the runner touches.
function file(size: number, type = "application/zip"): File {
  return {
    size,
    type,
    slice: (start: number, end: number) => ({ start, end }),
  } as unknown as File;
}

beforeEach(() => {
  initiateUpload.mockReset().mockResolvedValue({ id: "u1", offset: 0 });
  // The gateway answers with the new offset after each accepted chunk.
  appendChunk.mockReset().mockImplementation((_id, offset, slice) => (slice as { end: number }).end ?? offset);
  finalizeUpload.mockReset().mockResolvedValue({ hash: "abc", size: 1 });
});

test("returns the finalized blob from the gateway", async () => {
  assert.deepEqual(await runChunkedUpload(file(10)), { hash: "abc", size: 1 });
  assert.deepEqual(finalizeUpload.mock.calls, [["u1"]]);
});

test("initiates with the file size and its content type", async () => {
  await runChunkedUpload(file(42, "application/x-zip"));
  assert.deepEqual(initiateUpload.mock.calls, [[42, "application/x-zip"]]);
});

test("falls back to application/zip when the browser reports no type", async () => {
  await runChunkedUpload(file(42, ""));
  assert.deepEqual(initiateUpload.mock.calls, [[42, "application/zip"]]);
});

test("slices the file into 8 MB chunks", async () => {
  await runChunkedUpload(file(20 * MB));
  assert.deepEqual(
    appendChunk.mock.calls.map((c) => [c[1], (c[2] as { start: number; end: number }).end]),
    [
      [0, CHUNK],
      [CHUNK, 2 * CHUNK],
      [2 * CHUNK, 20 * MB],
    ],
  );
});

test("a file smaller than one chunk is sent in a single request", async () => {
  await runChunkedUpload(file(1024));
  assert.equal(appendChunk.mock.calls.length, 1);
  assert.deepEqual(appendChunk.mock.calls[0][2], { start: 0, end: 1024 });
});

test("resumes from the offset the session reports", async () => {
  // HEAD /api/uploads/{id} told the gateway we already have 8 MB.
  initiateUpload.mockResolvedValue({ id: "u1", offset: CHUNK });
  await runChunkedUpload(file(10 * MB));
  assert.deepEqual(appendChunk.mock.calls.map((c) => c[1]), [CHUNK]);
});

test("an already-complete session skips straight to finalize", async () => {
  initiateUpload.mockResolvedValue({ id: "u1", offset: 5 * MB });
  await runChunkedUpload(file(5 * MB));
  assert.equal(appendChunk.mock.calls.length, 0);
  assert.equal(finalizeUpload.mock.calls.length, 1);
});

test("reports the three stages in order", async () => {
  const stages: string[] = [];
  await runChunkedUpload(file(1024), { onStage: (s) => stages.push(s) });
  assert.deepEqual(stages, ["initiating", "uploading", "finalizing"]);
});

test("progress is the accepted offset over the file size, ending at 1", async () => {
  const seen: number[] = [];
  await runChunkedUpload(file(20 * MB), { onProgress: (r) => seen.push(r) });
  assert.deepEqual(seen.map((r) => Number(r.toFixed(2))), [0.4, 0.8, 1]);
});

test("an aborted signal stops before sending the next chunk", async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(runChunkedUpload(file(20 * MB), { signal: ac.signal }), /upload aborted/);
  assert.equal(appendChunk.mock.calls.length, 0);
  assert.equal(finalizeUpload.mock.calls.length, 0, "an aborted upload must not finalize");
});

test("aborting mid-flight stops the loop at the next chunk boundary", async () => {
  const ac = new AbortController();
  appendChunk.mockImplementation((_id, _offset, slice) => {
    ac.abort();
    return (slice as { end: number }).end;
  });
  await assert.rejects(runChunkedUpload(file(20 * MB), { signal: ac.signal }), /upload aborted/);
  assert.equal(appendChunk.mock.calls.length, 1);
});

test("the abort signal is handed to the gateway so the in-flight PATCH is cut", async () => {
  const ac = new AbortController();
  await runChunkedUpload(file(1024), { signal: ac.signal });
  assert.equal(appendChunk.mock.calls[0][3], ac.signal);
});

test("a failing chunk rejects without finalizing", async () => {
  appendChunk.mockRejectedValue(new Error("network down"));
  await assert.rejects(runChunkedUpload(file(1024)), /network down/);
  assert.equal(finalizeUpload.mock.calls.length, 0);
});
