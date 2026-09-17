import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePanoramaTexture, type TextureDecoder } from "./use-panorama-texture";

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

const body = (bytes = 4) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(bytes));
      c.close();
    },
  });

const ok = (bytes = 4) =>
  new Response(body(bytes), { status: 200, headers: { "Content-Length": String(bytes) } });

const decoder = (): TextureDecoder => vi.fn(async () => bitmap());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("usePanoramaTexture", () => {
  it("streams the equirect and hands back the decoded bitmap — never a three Texture", async () => {
    // A `three` import here rides in every page's bundle (the feature is
    // imported eagerly by the viewer page); the sphere builds the texture,
    // and `panorama-sphere.spec.tsx` is where its mapping is asserted.
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const decode = decoder();
    const { result } = renderHook(() => usePanoramaTexture("abc", decode));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.progress).toBe(100);
    expect(result.current.bitmap).toBe(await vi.mocked(decode).mock.results[0].value);
  });

  it("hands the decoder the downloaded blob — the orientation is its business, not the hook's", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const decode = decoder();
    renderHook(() => usePanoramaTexture("abc", decode));

    await waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
    expect(vi.mocked(decode).mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it("is idle with no capture to show", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => usePanoramaTexture(null, decoder()));

    expect(result.current).toEqual({ bitmap: null, progress: null, status: "idle" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a refused download as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const { result } = renderHook(() => usePanoramaTexture("abc", decoder()));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.bitmap).toBeNull();
  });

  it("reports a picture it cannot decode as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const decode = vi.fn(async () => {
      throw new Error("not an image");
    });
    const { result } = renderHook(() => usePanoramaTexture("abc", decode));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.bitmap).toBeNull();
  });

  it("aborts a download the reader walked away from", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        signals.push(init.signal as AbortSignal);
        // Never settles: the swap happens while the first capture is still
        // on the wire.
        return await new Promise<Response>(() => {});
      }),
    );
    const { rerender } = renderHook(({ hash }) => usePanoramaTexture(hash, decoder()), {
      initialProps: { hash: "abc" },
    });
    rerender({ hash: "def" });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("reads as loading again the moment the reader moves to the next capture", async () => {
    // The bitmap on screen belongs to the sphere, which frees it when this
    // prop changes; the hook must not keep reporting it as this hash's.
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const { result, rerender } = renderHook(({ hash }) => usePanoramaTexture(hash, decoder()), {
      initialProps: { hash: "abc" },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const first = result.current.bitmap;

    rerender({ hash: "def" });
    expect(result.current).toEqual({ bitmap: null, progress: null, status: "loading" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.bitmap).not.toBe(first);
  });

  it("goes back to idle when the reader leaves the panorama, and closes the bitmap it handed out", async () => {
    // 32 MB for a 4096x2048 equirect, and not garbage-collected bytes. The
    // sphere cannot do it: its cleanup also runs on StrictMode's dev remount,
    // where the picture is still on screen.
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const { result, rerender } = renderHook(({ hash }) => usePanoramaTexture(hash, decoder()), {
      initialProps: { hash: "abc" as string | null },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const delivered = result.current.bitmap!;

    rerender({ hash: null });
    expect(result.current).toEqual({ bitmap: null, progress: null, status: "idle" });
    expect(delivered.close).toHaveBeenCalledTimes(1);
  });

  it("closes the bitmap when the reader leaves the page altogether", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const { result, unmount } = renderHook(() => usePanoramaTexture("abc", decoder()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const delivered = result.current.bitmap!;

    unmount();
    expect(delivered.close).toHaveBeenCalledTimes(1);
  });

  it("downloads again when the reader comes back to the capture they just left", async () => {
    // The sphere freed the bitmap on the way out (close() detaches the bytes),
    // so answering "ready" with it would hand three a closed image — a flash,
    // two camera jumps, and an upload that cannot work.
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const { result, rerender } = renderHook(({ hash }) => usePanoramaTexture(hash, decoder()), {
      initialProps: { hash: "abc" as string | null },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const first = result.current.bitmap;

    rerender({ hash: null });
    rerender({ hash: "abc" });

    expect(result.current).toEqual({ bitmap: null, progress: null, status: "loading" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.bitmap).not.toBe(first);
  });

  it("says nothing about a download the abort tore down", async () => {
    // The reader has already moved on; reporting that capture's failure would
    // paint an error over the one now loading.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init: RequestInit) =>
          await new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    );
    const { result, unmount } = renderHook(() => usePanoramaTexture("abc", decoder()));
    unmount();
    await Promise.resolve();

    expect(result.current.status).toBe("loading");
  });

  it("closes a bitmap that finished decoding after the reader left", async () => {
    // Nothing holds it, and an ImageBitmap is not garbage-collected bytes.
    let release!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          await new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const closed = vi.fn();
    const decode = vi.fn(async () => ({ close: closed }) as unknown as ImageBitmap);
    const { unmount } = renderHook(() => usePanoramaTexture("abc", decode));

    unmount();
    release(ok());
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  });
});
