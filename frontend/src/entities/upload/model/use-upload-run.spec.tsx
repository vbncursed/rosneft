import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { runChunkedUpload } from "./run-chunked-upload";
import { useUploadRun } from "./use-upload-run";

const { initiateUpload, appendChunk, finalizeUpload, abortUpload } = vi.hoisted(() => ({
  initiateUpload: vi.fn(),
  appendChunk: vi.fn(),
  finalizeUpload: vi.fn(),
  abortUpload: vi.fn(),
}));

vi.mock("../api/upload-gateway", () => ({ initiateUpload, appendChunk, finalizeUpload, abortUpload }));

const MB = 1024 * 1024;
const fakeFile = (size = 20 * MB) =>
  ({
    name: "a.zip",
    size,
    type: "application/zip",
    slice: (s: number, e: number) => ({ size: e - s, end: e }),
  }) as unknown as File;

const setup = () => renderHook(() => ({ u: useUploadRun(), notices: useNotices() }));

beforeEach(() => {
  initiateUpload.mockReset().mockResolvedValue({ id: "u1", size: 20 * MB, offset: 0 });
  appendChunk.mockReset().mockImplementation((_i: string, _o: number, slice: { end: number }) => slice.end);
  finalizeUpload.mockReset().mockResolvedValue({ hash: "abc", size: 20 * MB });
  abortUpload.mockReset().mockResolvedValue(undefined);
  clearNotices();
});

describe("useUploadRun", () => {
  it("picks the first file and ignores an empty drop", () => {
    const { result } = setup();
    const f = fakeFile();
    act(() => void result.current.u.pick([]));
    expect(result.current.u.file).toBeNull();
    let got: File | null = null;
    act(() => {
      got = result.current.u.pick([f, fakeFile()]);
    });
    expect(got).toBe(f);
    expect(result.current.u.file).toBe(f);
    act(() => result.current.u.clear());
    expect(result.current.u.file).toBeNull();
  });

  it("runs to a finalized blob, reporting stages and progress only while active", async () => {
    const { result } = setup();
    const stages: string[] = [];
    let blob: unknown;
    await act(async () => {
      blob = await runChunkedUpload(
        fakeFile(),
        result.current.u.begin((s) => stages.push(s)),
      );
    });
    expect(blob).toEqual({ hash: "abc", size: 20 * MB });
    expect(stages).toContain("finalizing");
    expect(result.current.u.percent).toBe(100);
    expect(result.current.u.view(true)?.value).toBe(100);
    expect(result.current.u.view(false)).toBeUndefined();
  });

  it("toasts a genuine failure but stays silent on a cancel", async () => {
    const { result } = setup();
    appendChunk.mockRejectedValueOnce(new HttpError(500, null, "boom"));
    await act(async () => {
      await runChunkedUpload(
        fakeFile(),
        result.current.u.begin(() => {}),
      ).catch((e: unknown) => result.current.u.fail(e));
    });
    expect(result.current.notices).toHaveLength(1);

    clearNotices();
    appendChunk.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      const run = runChunkedUpload(
        fakeFile(),
        result.current.u.begin(() => {}),
      ).catch((e: unknown) => result.current.u.fail(e));
      result.current.u.cancel();
      await run;
    });
    expect(result.current.notices).toHaveLength(0);
  });
});
