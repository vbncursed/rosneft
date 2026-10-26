import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocument = vi.fn(() => ({ promise: Promise.resolve("doc") }));
const lib = { GlobalWorkerOptions: { workerSrc: "" }, getDocument, OPS: { save: 10 } };
vi.mock("/pdfjs/build/pdf.mjs", () => lib);

import { loadPdfjs, openPdf, pageViewport, type PdfPage } from "./pdfjs";

describe("loadPdfjs", () => {
  beforeEach(() => getDocument.mockClear());

  it("loads the vendored build once and points it at the vendored worker", async () => {
    const [a, b] = await Promise.all([loadPdfjs(), loadPdfjs()]);
    expect(a).toBe(b);
    expect(a.GlobalWorkerOptions.workerSrc).toBe("/pdfjs/build/pdf.worker.mjs");
  });

  it("opens documents with eval switched off", async () => {
    const data = new Uint8Array([1]);
    await expect(openPdf(data)).resolves.toBe("doc");
    expect(getDocument).toHaveBeenCalledWith({ data, isEvalSupported: false });
  });
});

describe("pageViewport", () => {
  it("asks for rotation 0 at scale 1 even when the page has /Rotate 90", () => {
    const getViewport = vi.fn(({ rotation }: { rotation: number }) => ({
      rotation,
      width: 1,
      height: 1,
      transform: [],
    }));
    const page = { rotate: 90, getViewport } as unknown as PdfPage;
    pageViewport(page);
    expect(getViewport).toHaveBeenCalledWith({ scale: 1, rotation: 0 });
  });
});
