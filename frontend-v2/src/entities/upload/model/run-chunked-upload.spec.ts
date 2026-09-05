import { beforeEach, describe, expect, it, vi } from "vitest";

const initiateUpload = vi.fn();
const appendChunk = vi.fn();
const finalizeUpload = vi.fn();

vi.mock("../api/upload-gateway", () => ({
  initiateUpload: (...args: unknown[]) => initiateUpload(...args),
  appendChunk: (...args: unknown[]) => appendChunk(...args),
  finalizeUpload: (...args: unknown[]) => finalizeUpload(...args),
}));

const { runChunkedUpload } = await import("./run-chunked-upload");

const MB = 1024 * 1024;
const CHUNK = 8 * MB;

// A File stand-in: size and slice are all the runner touches.
function fakeFile(size: number): File {
  return {
    size,
    type: "application/zip",
    slice: (start: number, end: number) => ({ start, end }),
  } as unknown as File;
}

beforeEach(() => {
  initiateUpload.mockReset().mockResolvedValue({ id: "u1", offset: 0 });
  // The gateway answers with the new total offset after each accepted chunk.
  appendChunk.mockReset().mockImplementation((_id, _offset, slice) => (slice as { end: number }).end);
  finalizeUpload.mockReset().mockResolvedValue({ hash: "abc", size: 1 });
});

describe("runChunkedUpload", () => {
  it("slices a 20 MiB file into three 8 MiB chunks, reporting byte/chunk progress, and finalizes once", async () => {
    const seen: unknown[] = [];
    const out = await runChunkedUpload(fakeFile(20 * MB), { onProgress: (p) => seen.push(p) });
    expect(seen).toEqual([
      { bytes: CHUNK, total: 20 * MB, chunk: 1, chunks: 3 },
      { bytes: 2 * CHUNK, total: 20 * MB, chunk: 2, chunks: 3 },
      { bytes: 20 * MB, total: 20 * MB, chunk: 3, chunks: 3 },
    ]);
    expect(finalizeUpload).toHaveBeenCalledTimes(1);
    expect(finalizeUpload).toHaveBeenCalledWith("u1");
    expect(out).toEqual({ hash: "abc", size: 1 });
  });

  it("reports the three stages in order", async () => {
    const stages: string[] = [];
    await runChunkedUpload(fakeFile(1024), { onStage: (s) => stages.push(s) });
    expect(stages).toEqual(["initiating", "uploading", "finalizing"]);
  });

  it("resumes at the session's offset, skipping the chunk already accepted", async () => {
    initiateUpload.mockResolvedValue({ id: "u1", offset: CHUNK });
    await runChunkedUpload(fakeFile(20 * MB));
    expect(appendChunk.mock.calls.map((c) => c[1])).toEqual([CHUNK, 2 * CHUNK]);
  });

  it("rejects when aborted between chunks and never finalizes", async () => {
    const ac = new AbortController();
    appendChunk.mockImplementation((_id, _offset, slice) => {
      ac.abort();
      return (slice as { end: number }).end;
    });
    await expect(
      runChunkedUpload(fakeFile(20 * MB), { signal: ac.signal }),
    ).rejects.toThrow("upload aborted");
    expect(appendChunk).toHaveBeenCalledTimes(1);
    expect(finalizeUpload).not.toHaveBeenCalled();
  });

  it("rejects immediately for a signal that is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      runChunkedUpload(fakeFile(20 * MB), { signal: ac.signal }),
    ).rejects.toThrow("upload aborted");
    expect(appendChunk).not.toHaveBeenCalled();
    expect(finalizeUpload).not.toHaveBeenCalled();
  });

  it("rejects when aborted right after the last chunk resolves, before finalizing", async () => {
    const ac = new AbortController();
    appendChunk.mockImplementation((_id, _offset, slice) => {
      ac.abort();
      return (slice as { end: number }).end;
    });
    await expect(
      runChunkedUpload(fakeFile(CHUNK), { signal: ac.signal }),
    ).rejects.toThrow("upload aborted");
    expect(appendChunk).toHaveBeenCalledTimes(1);
    expect(finalizeUpload).not.toHaveBeenCalled();
  });
});
