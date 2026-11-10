import { afterEach, describe, expect, it, vi } from "vitest";
import { runRegistration } from "./run-registration";

afterEach(() => vi.restoreAllMocks());

describe("runRegistration", () => {
  it("returns no proposal when there is no usable texture", async () => {
    const result = await runRegistration(
      {} as ImageBitmap,
      { width: 100, height: 100 },
      { groundAt: () => 0, fallbackY: 0 },
      100,
      new AbortController().signal,
    );
    expect(result).toEqual([]);
  });
  it("retries when the terrain changes while the worker runs", async () => {
    const geometry = { positions: new Float32Array(), uvs: new Float32Array(), indices: null, matrix: [] };
    const image = { data: new Uint8Array(16), width: 4, height: 4 };
    const registration = vi
      .fn()
      .mockReturnValueOnce({ image, geometry, isCurrent: () => false })
      .mockReturnValueOnce({ image, geometry, isCurrent: () => true });
    const context = { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(64) }) };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    class FakeWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror = null;
      postMessage() {
        queueMicrotask(() => this.onmessage?.({ data: { matches: [], points: [] } }));
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", FakeWorker);
    try {
      await runRegistration(
        { width: 4, height: 4 } as ImageBitmap,
        { width: 4, height: 4 },
        { groundAt: () => 0, fallbackY: 0, registration },
        100,
        new AbortController().signal,
      );
      expect(registration).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not run an already cancelled request", async () => {
    const registration = vi.fn();
    const controller = new AbortController();
    controller.abort();
    expect(
      await runRegistration(
        {} as ImageBitmap,
        { width: 100, height: 100 },
        { groundAt: () => 0, fallbackY: 0, registration },
        100,
        controller.signal,
      ),
    ).toEqual([]);
    expect(registration).not.toHaveBeenCalled();
  });
});
