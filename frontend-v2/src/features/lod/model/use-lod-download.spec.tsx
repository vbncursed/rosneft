import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLodDownload } from "./use-lod-download";

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });

describe("useLodDownload", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("streams the bytes, reports progress and ends with a blob url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(streamOf([new Uint8Array(3), new Uint8Array(2)]), { status: 200 })),
    );
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    const { result, unmount } = renderHook(() => useLodDownload({ lod: 0, hash: "a", size: 5 }));
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:x"));
    expect(result.current.received).toBe(5);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("reports the status of a refused download", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    const { result } = renderHook(() => useLodDownload({ lod: 0, hash: "a", size: 5 }));
    await waitFor(() => expect(result.current.failed).toEqual({ status: 502 }));
  });

  it("does nothing for null", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLodDownload(null));
    expect(result.current).toEqual({ blobUrl: null, received: 0, failed: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
