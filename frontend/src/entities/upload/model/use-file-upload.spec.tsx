import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useFileUpload, type FileUploadState } from "./use-file-upload";

// The hook lives in this slice, so the runner cannot be mocked from outside it
// — the gateway underneath it is, and runChunkedUpload drives for real over
// those stubs. Same shape as run-chunked-upload.spec.ts.
const { initiateUpload, appendChunk, finalizeUpload, abortUpload } = vi.hoisted(() => ({
  initiateUpload: vi.fn(),
  appendChunk: vi.fn(),
  finalizeUpload: vi.fn(),
  abortUpload: vi.fn(),
}));

vi.mock("../api/upload-gateway", () => ({
  initiateUpload,
  appendChunk,
  finalizeUpload,
  abortUpload,
}));

const MB = 1024 * 1024;
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];

/** A File stand-in: the head slice answers arrayBuffer, a chunk slice its end. */
function fakeFile(head: number[], size = 20 * MB): File {
  const bytes = new Uint8Array(head);
  return {
    name: "pump-house-south.jpg",
    size,
    type: "image/jpeg",
    slice: (start: number, end: number) => ({
      start,
      end,
      size: end - start,
      arrayBuffer: async () => bytes.buffer,
    }),
  } as unknown as File;
}

const isJpeg = (head: Uint8Array) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;

/** Chunks that only resolve when the test lets them, so a mid-upload frame can be read. */
function deferChunks() {
  const waiting: (() => void)[] = [];
  appendChunk.mockImplementation(
    (_id: string, _offset: number, slice: { end: number }) =>
      new Promise<number>((resolve) => waiting.push(() => resolve(slice.end))),
  );
  return async () => {
    await act(async () => {
      waiting.shift()?.();
    });
  };
}

const upload = () =>
  renderHook(() => ({
    u: useFileUpload({
      sniff: isJpeg,
      refusal: "Please choose an equirectangular JPG or PNG image.",
      uploadingLabel: (percent) => `Reading EXIF · ${percent} %`,
    }),
    notices: useNotices(),
  }));

beforeEach(() => {
  initiateUpload.mockReset().mockResolvedValue({ id: "u1", size: 20 * MB, offset: 0 });
  appendChunk
    .mockReset()
    .mockImplementation((_id: string, _offset: number, slice: { end: number }) => slice.end);
  finalizeUpload.mockReset().mockResolvedValue({ hash: "abc", size: 20 * MB });
  abortUpload.mockReset().mockResolvedValue(undefined);
  clearNotices();
});

describe("useFileUpload", () => {
  it("starts idle with no file", () => {
    const { result } = upload();
    expect(result.current.u.state).toEqual({ stage: "idle", file: null });
  });

  it("keeps a file whose leading bytes the sniff accepts", async () => {
    const file = fakeFile(JPEG);
    const { result } = upload();

    await act(async () => {
      await result.current.u.pick(file);
    });

    expect(result.current.u.state).toEqual({ stage: "picked", file });
  });

  it("refuses a file whose leading bytes the sniff rejects, with the caller's reason", async () => {
    const { result } = upload();

    await act(async () => {
      await result.current.u.pick(fakeFile([0x50, 0x4b, 0x03, 0x04]));
    });

    expect(result.current.u.state).toEqual({
      stage: "refused",
      file: null,
      reason: "Please choose an equirectangular JPG or PNG image.",
    });
  });

  it("clear() puts a refusal back to idle so the reader can pick again", async () => {
    const { result } = upload();
    await act(async () => {
      await result.current.u.pick(fakeFile([0x50, 0x4b]));
    });

    act(() => result.current.u.clear());

    expect(result.current.u.state).toEqual({ stage: "idle", file: null });
  });

  it("labels each frame with the percent the gateway's offsets imply", async () => {
    const release = deferChunks();
    const file = fakeFile(JPEG);
    const { result } = upload();
    await act(async () => {
      await result.current.u.pick(file);
    });

    act(() => void result.current.u.run(async () => "created"));
    await waitFor(() => expect(result.current.u.state.stage).toBe("uploading"));

    // 8 MiB of 20 — the first chunk.
    await release();
    expect(result.current.u.state).toMatchObject({
      stage: "uploading",
      percent: 40,
      label: "Reading EXIF · 40 %",
    });

    await release();
    expect(result.current.u.state).toMatchObject({ stage: "uploading", percent: 80 });
  });

  it("runs the caller's work once the bytes land, then returns to idle with its value", async () => {
    let finishWork!: (value: string) => void;
    const work = vi.fn(
      (): Promise<string> => new Promise((resolve) => (finishWork = resolve)),
    );
    const file = fakeFile(JPEG);
    const { result } = upload();
    await act(async () => {
      await result.current.u.pick(file);
    });

    let pending!: Promise<string | null>;
    await act(async () => {
      pending = result.current.u.run(work);
    });

    expect(work).toHaveBeenCalledWith({ hash: "abc", size: 20 * MB }, file);
    expect(result.current.u.state).toEqual({ stage: "creating", file });

    await act(async () => {
      finishWork("created");
      await pending;
    });
    expect(await pending).toBe("created");
    expect(result.current.u.state).toEqual({ stage: "idle", file: null });
  });

  it("does nothing when no file is picked", async () => {
    const work = vi.fn();
    const { result } = upload();

    await expect(result.current.u.run(work)).resolves.toBeNull();
    expect(work).not.toHaveBeenCalled();
    expect(initiateUpload).not.toHaveBeenCalled();
  });

  it("a cancel mid-upload discards the session, keeps the file picked and says nothing", async () => {
    const release = deferChunks();
    const file = fakeFile(JPEG);
    const work = vi.fn();
    const { result } = upload();
    await act(async () => {
      await result.current.u.pick(file);
    });

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.u.run(work);
    });
    await waitFor(() => expect(result.current.u.state.stage).toBe("uploading"));

    act(() => result.current.u.cancel());
    await release();
    await act(async () => {
      await pending;
    });

    expect(await pending).toBeNull();
    expect(abortUpload).toHaveBeenCalledWith("u1");
    expect(work).not.toHaveBeenCalled();
    expect(result.current.u.state).toEqual({ stage: "picked", file });
    // A deliberate cancel is not a failure to report.
    expect(result.current.notices).toEqual([]);
  });

  it("toasts a work that throws, resolves null and keeps the file picked", async () => {
    const file = fakeFile(JPEG);
    const { result } = upload();
    await act(async () => {
      await result.current.u.pick(file);
    });

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.u.run(async () => {
        throw new HttpError(422, null, "Panorama refused.");
      });
      await pending;
    });

    expect(await pending).toBeNull();
    expect(result.current.notices[0]).toMatchObject({ tone: "error", message: "Panorama refused." });
    expect(result.current.u.state).toEqual({ stage: "picked", file });
  });

  it("toasts a failed upload in plain words and keeps the file picked", async () => {
    // A dropped PATCH is not an HttpError, so messageOf answers the plain
    // sentence rather than leaking "upload chunk failed: 507" at a reader.
    appendChunk.mockRejectedValue(new Error("upload chunk failed: 507"));
    const file = fakeFile(JPEG);
    const { result } = upload();
    await act(async () => {
      await result.current.u.pick(file);
    });

    await act(async () => {
      await result.current.u.run(async () => "created");
    });

    expect(result.current.notices[0]).toMatchObject({
      tone: "error",
      message: "Something went wrong. Try again.",
    });
    expect(result.current.u.state).toEqual({ stage: "picked", file });
  });

  it("sniffs only the head the caller asked for", async () => {
    const slice = vi.fn((start: number, end: number) => ({
      start,
      end,
      arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer,
    }));
    const file = { name: "a.pdf", size: 10, type: "", slice } as unknown as File;
    const { result } = renderHook(() =>
      useFileUpload({
        sniff: (head: Uint8Array) => head.length === 5,
        refusal: "Please choose a PDF file.",
        headBytes: 5,
        uploadingLabel: (p) => `Uploading · ${p} %`,
      }),
    );

    await act(async () => {
      await result.current.pick(file);
    });

    expect(slice).toHaveBeenCalledWith(0, 5);
    expect((result.current.state as Extract<FileUploadState, { stage: "picked" }>).stage).toBe(
      "picked",
    );
  });
});
