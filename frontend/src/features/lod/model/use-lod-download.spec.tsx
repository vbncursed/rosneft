import { StrictMode, useEffect } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLodDownload, type LodDownload } from "./use-lod-download";

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
    expect(result.current).toEqual({ blobUrl: null, received: 0, failed: null, held: null });

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

  // A return before anything else is drawn (`drawn` stays null here): the
  // finished blob is still held. Fetching it again kept two copies of the same
  // level alive (blob, drei's parsed scene) and paid for the bytes twice.
  it("adopts the held blob on a return to its level: no fetch, no revoke, nothing held", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(5)]), { status: 200 })));
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:a"), revokeObjectURL: revoke });
    const a = { lod: 0, hash: "a", size: 5 };
    const { result, rerender } = renderHook(({ art }) => useLodDownload(art), {
      initialProps: { art: a as typeof a | null },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: null });
    rerender({ art: a });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    // The level's own size, so the chip reads full rather than 0 %.
    expect(result.current).toEqual({ blobUrl: "blob:a", received: 5, failed: null, held: null });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  // Until the adoption effect committed, the return read as idle for one
  // render, and the page's chip showed "0 %" against a download never started.
  it("reads a return to the held level as adopted from its very first render", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(5)]), { status: 200 })));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:a"), revokeObjectURL: vi.fn() });
    const a = { lod: 0, hash: "a", size: 5 };
    const seen: LodDownload[] = [];
    const { result, rerender } = renderHook(
      ({ art }) => {
        const d = useLodDownload(art);
        useEffect(() => {
          seen.push(d);
        });
        return d;
      },
      { initialProps: { art: a as typeof a | null } },
    );
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: null });
    const from = seen.length;
    rerender({ art: a });
    expect(seen.slice(from).length).toBeGreaterThan(0);
    for (const d of seen.slice(from)) {
      expect(d).toEqual({ blobUrl: "blob:a", received: 5, failed: null, held: null });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // LOD 1 held on screen, LOD 0 downloaded but not drawn yet, and the target
  // goes back to 1: revoking the held blob there killed the drawn mesh.
  it("leaving a finished level while the held one is drawn revokes the finished one and keeps the drawn one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(2)]), { status: 200 })));
    const minted = ["blob:a", "blob:b"];
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => minted.shift()), revokeObjectURL: revoke });
    const lvl = (lod: number, hash: string) => ({ lod, hash, size: 2 });
    const { result, rerender } = renderHook(({ art, drawn }) => useLodDownload(art, drawn), {
      initialProps: { art: lvl(1, "a"), drawn: "blob:a" as string | null },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: lvl(0, "b"), drawn: "blob:a" });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:b"));

    rerender({ art: lvl(1, "a"), drawn: "blob:a" });
    expect(revoke).toHaveBeenCalledWith("blob:b");
    expect(revoke).not.toHaveBeenCalledWith("blob:a");
    expect(result.current).toEqual({ blobUrl: "blob:a", received: 2, failed: null, held: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("adopts under StrictMode's double effects too, and still revokes the blob on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(5)]), { status: 200 })));
    const revoke = vi.fn();
    // Distinct urls: StrictMode's first, aborted download mints and revokes a
    // blob of its own, and that one must not be mistaken for the kept one.
    let n = 0;
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => `blob:${++n}`), revokeObjectURL: revoke });
    const a = { lod: 0, hash: "a", size: 5 };
    const { result, rerender, unmount } = renderHook(({ art }) => useLodDownload(art), {
      initialProps: { art: a as typeof a | null },
      wrapper: StrictMode,
    });
    await waitFor(() => expect(result.current.blobUrl).not.toBeNull());
    const kept = result.current.blobUrl;
    const fetches = vi.mocked(fetch).mock.calls.length;
    rerender({ art: null });
    rerender({ art: a });
    await waitFor(() => expect(result.current).toMatchObject({ blobUrl: kept, received: 5, held: null }));
    expect(fetch).toHaveBeenCalledTimes(fetches);
    expect(revoke).not.toHaveBeenCalledWith(kept);
    unmount();
    expect(revoke).toHaveBeenCalledWith(kept);
  });

  it("a return to a level that is neither current nor held starts from nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(2)]), { status: 200 })));
    const minted = ["blob:a", "blob:b", "blob:c", "blob:a2"];
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => minted.shift()), revokeObjectURL: revoke });
    const lvl = (lod: number, hash: string) => ({ lod, hash, size: 2 });
    const { result, rerender } = renderHook(({ art }) => useLodDownload(art), {
      initialProps: { art: lvl(2, "a") },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: lvl(1, "b") });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:b"));
    rerender({ art: lvl(0, "c") });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:c"));
    expect(revoke).toHaveBeenCalledWith("blob:a");

    // A's blob went when B's replaced it: the return counts from 0, never
    // from the old 100 % against a revoked blob.
    rerender({ art: lvl(2, "a") });
    expect(result.current).toEqual({
      blobUrl: null,
      received: 0,
      failed: null,
      held: { hash: "c", blobUrl: "blob:c" },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a2"));
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  // LOD 1's blob and parsed scene sat in memory for the whole session once
  // Auto had LOD 0 on screen, though nothing could draw LOD 1 again.
  it("releases the held blob once the level it downloads is on screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(2)]), { status: 200 })));
    const minted = ["blob:a", "blob:b"];
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => minted.shift()), revokeObjectURL: revoke });
    const lvl = (lod: number, hash: string) => ({ lod, hash, size: 2 });
    const { result, rerender } = renderHook(({ art, drawn }) => useLodDownload(art, drawn), {
      initialProps: { art: lvl(1, "a"), drawn: "blob:a" as string | null },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: lvl(0, "b"), drawn: "blob:a" });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:b"));
    expect(result.current.held).toEqual({ hash: "a", blobUrl: "blob:a" });
    expect(revoke).not.toHaveBeenCalled();

    rerender({ art: lvl(0, "b"), drawn: "blob:b" });
    expect(result.current.held).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:a");
    expect(revoke).not.toHaveBeenCalledWith("blob:b");
  });

  // LOD 0 → the coarsest: the coarsest is never streamed, so no blob of this
  // level was ever drawn, and LOD 0's blob and parsed scene stayed for the
  // rest of the visit.
  it("releases the held blob once the coarsest level, drawn by its asset route, is on screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(2)]), { status: 200 })));
    const minted = ["blob:a", "blob:a2"];
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => minted.shift()), revokeObjectURL: revoke });
    const a = { lod: 0, hash: "a", size: 2 };
    const { result, rerender } = renderHook(({ art, drawn }) => useLodDownload(art, drawn), {
      initialProps: { art: a as typeof a | null, drawn: "blob:a" as string | null },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: null, drawn: "blob:a" });
    expect(result.current.held).toEqual({ hash: "a", blobUrl: "blob:a" });
    expect(revoke).not.toHaveBeenCalled();

    rerender({ art: null, drawn: "/api/assets/coarse" });
    expect(result.current.held).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:a");

    // Released, so a return fetches the level again rather than adopting a
    // revoked blob.
    rerender({ art: a, drawn: "/api/assets/coarse" });
    expect(result.current.blobUrl).toBeNull();
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a2"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // A refused LOD 0 leaves LOD 1 on screen off its held blob; a manual LOD 1
  // then wants that very level, already drawn, in the same render.
  it("never releases the blob it is adopting when that level is already on screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/b")
          ? new Response(null, { status: 502 })
          : new Response(streamOf([new Uint8Array(2)]), { status: 200 }),
      ),
    );
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:a"), revokeObjectURL: revoke });
    const lvl = (lod: number, hash: string) => ({ lod, hash, size: 2 });
    const { result, rerender } = renderHook(({ art, drawn }) => useLodDownload(art, drawn), {
      initialProps: { art: lvl(1, "a"), drawn: "blob:a" as string | null },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: lvl(0, "b"), drawn: "blob:a" });
    await waitFor(() => expect(result.current.failed).toEqual({ status: 502 }));

    rerender({ art: lvl(1, "a"), drawn: "blob:a" });
    await waitFor(() => expect(result.current).toMatchObject({ blobUrl: "blob:a", held: null }));
    expect(revoke).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // The level on screen while a finer one downloads is the one before it: its
  // blob has to outlive the level change, or the page falls back to the
  // coarsest for the whole download.
  it("keeps the previous finished level's blob as held, and revokes it once replaced or unmounted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf([new Uint8Array(2)]), { status: 200 })));
    const minted = ["blob:a", "blob:b", "blob:c"];
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => minted.shift()), revokeObjectURL: revoke });
    const lvl = (lod: number, hash: string) => ({ lod, hash, size: 2 });
    const { result, rerender, unmount } = renderHook(({ art }) => useLodDownload(art), {
      initialProps: { art: lvl(2, "a") },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));

    rerender({ art: lvl(1, "b") });
    expect(result.current.held).toEqual({ hash: "a", blobUrl: "blob:a" });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:b"));
    expect(result.current.held).toEqual({ hash: "a", blobUrl: "blob:a" });
    expect(revoke).not.toHaveBeenCalledWith("blob:a");

    rerender({ art: lvl(0, "c") });
    expect(result.current.held).toEqual({ hash: "b", blobUrl: "blob:b" });
    expect(revoke).toHaveBeenCalledWith("blob:a");
    expect(revoke).not.toHaveBeenCalledWith("blob:b");
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:c"));

    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:b");
    expect(revoke).toHaveBeenCalledWith("blob:c");
  });

  it("an unfinished level never becomes held, and leaves the one before it in place", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/b")
          ? new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 })
          : new Response(streamOf([new Uint8Array(2)]), { status: 200 }),
      ),
    );
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:a"), revokeObjectURL: revoke });
    const lvl = (lod: number, hash: string) => ({ lod, hash, size: 2 });
    const { result, rerender } = renderHook(({ art }) => useLodDownload(art), {
      initialProps: { art: lvl(2, "a") as ReturnType<typeof lvl> | null },
    });
    await waitFor(() => expect(result.current.blobUrl).toBe("blob:a"));
    rerender({ art: lvl(1, "b") });
    rerender({ art: null });
    expect(result.current.held).toEqual({ hash: "a", blobUrl: "blob:a" });
    expect(revoke).not.toHaveBeenCalled();
  });

  it("holds nothing when the level left had not finished", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 })),
    );
    const { result, rerender } = renderHook(({ art }) => useLodDownload(art), {
      initialProps: { art: { lod: 1, hash: "a", size: 2 } as { lod: number; hash: string; size: number } | null },
    });
    rerender({ art: null });
    expect(result.current.held).toBeNull();
  });

  it("does nothing for null", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useLodDownload(null));
    expect(result.current).toEqual({ blobUrl: null, received: 0, failed: null, held: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
