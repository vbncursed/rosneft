import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepeatWrapping, SRGBColorSpace, Texture } from "three";
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
  it("streams the equirect and hands back a texture mapped for the inside of a sphere", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const decode = decoder();
    const { result } = renderHook(() => usePanoramaTexture("abc", decode));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const texture = result.current.texture as Texture;
    expect(result.current.progress).toBe(100);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    // The bitmap arrives pre-flipped, and WebGL cannot flip one itself.
    expect(texture.flipY).toBe(false);
    // U reversed so the photo is not mirrored on a BackSide sphere.
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.repeat.x).toBe(-1);
    expect(texture.offset.x).toBe(1);
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

    expect(result.current).toEqual({ texture: null, progress: null, status: "idle" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a refused download as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const { result } = renderHook(() => usePanoramaTexture("abc", decoder()));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.texture).toBeNull();
  });

  it("reports a picture it cannot decode as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const decode = vi.fn(async () => {
      throw new Error("not an image");
    });
    const { result } = renderHook(() => usePanoramaTexture("abc", decode));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.texture).toBeNull();
  });

  it("aborts a download the reader walked away from, and disposes a texture that never existed", async () => {
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
    const dispose = vi.spyOn(Texture.prototype, "dispose");

    const { rerender } = renderHook(({ hash }) => usePanoramaTexture(hash, decoder()), {
      initialProps: { hash: "abc" },
    });
    rerender({ hash: "def" });

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposes the previous texture when the reader moves to the next capture", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const dispose = vi.spyOn(Texture.prototype, "dispose");
    const { result, rerender } = renderHook(({ hash }) => usePanoramaTexture(hash, decoder()), {
      initialProps: { hash: "abc" },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ hash: "def" });
    expect(dispose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("goes back to idle when the reader leaves the panorama", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    const { result, rerender } = renderHook(({ hash }) => usePanoramaTexture(hash, decoder()), {
      initialProps: { hash: "abc" as string | null },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ hash: null });
    expect(result.current).toEqual({ texture: null, progress: null, status: "idle" });
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
