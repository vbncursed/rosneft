import { afterEach, describe, expect, it, vi } from "vitest";

import type { PdfPage } from "./pdfjs";
import { renderPage } from "./render-page";

afterEach(() => vi.unstubAllGlobals());

describe("renderPage", () => {
  it("scales the longer side to maxPx and returns the bitmap", async () => {
    const bitmap = { width: 4096 } as ImageBitmap;
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const getViewport = vi.fn(({ scale }: { scale: number }) => ({
      width: 2384 * scale,
      height: 1684 * scale,
      transform: [],
    }));
    const render = vi.fn<(opts: { canvas: HTMLCanvasElement }) => { promise: Promise<void> }>(() => ({
      promise: Promise.resolve(),
    }));
    const page = { getViewport, render } as unknown as PdfPage;

    await expect(renderPage(page)).resolves.toBe(bitmap);

    expect(getViewport).toHaveBeenLastCalledWith({ scale: 4096 / 2384, rotation: 0 });
    const canvas = render.mock.calls[0][0].canvas;
    expect([canvas.width, canvas.height]).toEqual([4096, Math.ceil(1684 * (4096 / 2384))]);
    expect(createImageBitmap).toHaveBeenCalledWith(canvas);
  });

  it("honours a smaller maxPx", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({}));
    const getViewport = vi.fn(({ scale }: { scale: number }) => ({
      width: 1000 * scale,
      height: 500 * scale,
      transform: [],
    }));
    const page = { getViewport, render: () => ({ promise: Promise.resolve() }) } as unknown as PdfPage;
    await renderPage(page, 100);
    expect(getViewport).toHaveBeenLastCalledWith({ scale: 0.1, rotation: 0 });
  });
});
