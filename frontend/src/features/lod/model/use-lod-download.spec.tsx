import { act, renderHook, waitFor } from "@testing-library/react";
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

  it("a level change drops the previous level's progress, and its late bytes cannot come back", async () => {
    // A stream we hold the controller of: artifact A reports a chunk and then
    // stalls, so the swap to B happens mid-download.
    let stalled!: ReadableStreamDefaultController<Uint8Array>;
    const a = { lod: 0, hash: "a", size: 9 };
    const b = { lod: 1, hash: "b", size: 7 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/a")
          ? new Response(
              new ReadableStream<Uint8Array>({
                start(c) {
                  stalled = c;
                },
              }),
              { status: 200 },
            )
          : new Response(streamOf([new Uint8Array(7)]), { status: 200 }),
      ),
    );
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:b"), revokeObjectURL: vi.fn() });

    const { result, rerender } = renderHook(({ art }) => useLodDownload(art), {
      initialProps: { art: a },
    });
    await act(async () => {
      stalled.enqueue(new Uint8Array(3));
    });
    expect(result.current.received).toBe(3);

    rerender({ art: b });
    // The state still describes A on this render; the hash guard is what makes
    // it read as idle rather than as B at 3 bytes.
    expect(result.current).toEqual({ blobUrl: null, received: 0, failed: null });

    await act(async () => {
      try {
        stalled.enqueue(new Uint8Array(6));
        stalled.close();
      } catch {
        // The abort already tore the stream down — either way A must not write.
      }
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:b"));
    expect(result.current.received).toBe(7);
    expect(result.current.failed).toBeNull();
  });

  it("revokes a blob that was minted after the cleanup fired", async () => {
    const revoke = vi.fn();
    let stop: (() => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(streamOf([new Uint8Array(4)]), { status: 200 })),
    );
    vi.stubGlobal("URL", {
      // Unmounting from inside createObjectURL reproduces the one window the
      // cleanup cannot see: it ran while `url` was still null, so nothing but
      // the download itself can revoke what it just minted.
      createObjectURL: vi.fn(() => {
        stop?.();
        return "blob:late";
      }),
      revokeObjectURL: revoke,
    });
    const { result, unmount } = renderHook(() => useLodDownload({ lod: 0, hash: "a", size: 4 }));
    stop = unmount;
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:late"));
    expect(result.current.blobUrl).toBeNull();
  });

  // 0 → 2 → 0: the coarse level is never streamed, so nothing overwrote the
  // finished download of LOD 0 — the return showed "100 %" for a frame and
  // warmed a blob that had already been revoked.
  it("forgets a finished level once it is left, so a return starts from nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(5)]), { status: 200 })));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:a"), revokeObjectURL: vi.fn() });
    const a = { lod: 0, hash: "a", size: 5 };
    const { result, rerender } = renderHook(({ art }) => useLodDownload(art), {
      initialProps: { art: a as typeof a | null },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: null });
    rerender({ art: a });
    expect(result.current).toEqual({ blobUrl: null, received: 0, failed: null });
  });

  it("does nothing for null", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLodDownload(null));
    expect(result.current).toEqual({ blobUrl: null, received: 0, failed: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
