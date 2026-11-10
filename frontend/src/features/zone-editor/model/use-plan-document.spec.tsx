import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { controlPoints, loadPdfjs, openPdf, renderPage } from "@/entities/site-plan";
import type { Document } from "@/entities/document";
import { fakeLib, fakePdf, PLAN_PAGE } from "./plan-pdf.fixture";
import { usePlanDocument } from "./use-plan-document";

vi.mock("@/entities/site-plan", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPdfjs: vi.fn(),
  openPdf: vi.fn(),
  renderPage: vi.fn(),
  controlPoints: vi.fn((await importOriginal<typeof import("@/entities/site-plan")>()).controlPoints),
}));

const doc = (calibration: Document["calibration"] = null): Document => ({
  id: 4,
  territorySlug: "t",
  title: "plan.pdf",
  sourceBlobHash: "h4",
  createdAt: "t0",
  calibration,
});

beforeEach(() => {
  vi.mocked(loadPdfjs).mockResolvedValue(fakeLib);
  vi.mocked(renderPage).mockResolvedValue({ width: 4096, height: 2893, close: vi.fn() });
});

describe("usePlanDocument", () => {
  it("opens the document and offers the page's rectangles, control points and picture", async () => {
    vi.mocked(openPdf).mockResolvedValue(fakePdf());
    const { result } = renderHook(() => usePlanDocument(doc()));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(openPdf).toHaveBeenCalledWith("/api/assets/h4");
    expect(result.current.rects.length).toBeGreaterThan(0);
    expect(result.current.controls?.map((c) => c.label)).toContain("ME1");
    expect(result.current.image).not.toBeNull();
    expect(result.current.pageSize).toEqual({ width: PLAN_PAGE.width, height: PLAN_PAGE.height });
  });

  it("extracts SHX annotations as plan labels", async () => {
    const pdf = fakePdf();
    const page = await pdf.getPage(1);
    page.getAnnotations = async () => [
      { subtype: "Text", titleObj: { str: "AutoCAD SHX Text" }, contentsObj: { str: "CAMP" }, rect: [10, 10, 12, 12] },
    ];
    pdf.getPage = async () => page;
    vi.mocked(openPdf).mockResolvedValue(pdf);
    const { result } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.labels.some((label) => label.text === "CAMP" && label.source === "shx")).toBe(true);
  });

  it("keeps the plan usable and reports unavailable annotations", async () => {
    const pdf = fakePdf();
    const page = await pdf.getPage(1);
    page.getAnnotations = async () => {
      throw new Error("bad annotations");
    };
    pdf.getPage = async () => page;
    vi.mocked(openPdf).mockResolvedValue(pdf);
    const { result } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.image).not.toBeNull();
    expect(result.current.rects.length).toBeGreaterThan(0);
    expect(result.current.annotationWarning).toBeTruthy();
  });

  it("lists all named layers including those outside the order and preserves visibility", async () => {
    const pdf = fakePdf();
    pdf.getOptionalContentConfig = async () => {
      const groups = new Map([
        ["a", { name: "Walls", visible: true }],
        ["b", { name: "Hidden", visible: false }],
      ]);
      return {
        getOrder: () => ["a"],
        getGroup: (id: string) => groups.get(id) ?? null,
        setVisibility: (id: string, visible: boolean) => {
          groups.get(id)!.visible = visible;
        },
        isVisible: () => true,
        [Symbol.iterator]: () => groups.entries(),
      };
    };
    vi.mocked(openPdf).mockResolvedValue(pdf);
    const { result } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.layers).toEqual([
      { id: "a", name: "Walls", visible: true },
      { id: "b", name: "Hidden", visible: false },
    ]);
    act(() => result.current.toggleLayer("b"));
    await waitFor(() => expect(result.current.layers[1].visible).toBe(true));
    expect(openPdf).toHaveBeenCalledTimes(1);
  });

  it("discards old document state and late renders when the source changes", async () => {
    const first = fakePdf();
    const second = fakePdf(2);
    let finish!: (image: ImageBitmap) => void;
    const late = { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap;
    const fresh = { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(openPdf).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    vi.mocked(renderPage)
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce(fresh);
    const { result, rerender } = renderHook(({ document }) => usePlanDocument(document), {
      initialProps: { document: doc() },
    });
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    rerender({ document: { ...doc(), sourceBlobHash: "new", calibration: { page: 2, points: [] } } });
    expect(result.current.image).toBeNull();
    expect(result.current.layers).toEqual([]);
    await waitFor(() => expect(result.current.image).toBe(fresh));
    expect(result.current.page).toBe(2);
    await act(async () => finish(late));
    expect(late.close).toHaveBeenCalledOnce();
    expect(result.current.image).toBe(fresh);
  });

  it("does not retain an error when the source changes", async () => {
    vi.mocked(openPdf).mockRejectedValueOnce(new Error("bad pdf")).mockResolvedValueOnce(fakePdf());
    const { result, rerender } = renderHook(({ document }) => usePlanDocument(document), {
      initialProps: { document: doc() },
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    rerender({ document: { ...doc(), sourceBlobHash: "new" } });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("starts on the calibrated page", async () => {
    vi.mocked(openPdf).mockResolvedValue(fakePdf(3));
    const { result } = renderHook(() => usePlanDocument(doc({ page: 2, points: [] })));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.page).toBe(2);
    expect(result.current.pageCount).toBe(3);
  });

  it("loads the new page when the page changes, and forgets the old one meanwhile", async () => {
    vi.mocked(openPdf).mockResolvedValue(fakePdf(2));
    const { result } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
    expect(result.current.status).toBe("loading");
    expect(result.current.controls).toBeNull();
    expect(result.current.rects).toEqual([]);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.controls).not.toBeNull();
  });

  it("never exposes a closed picture when the reader pages away and straight back", async () => {
    vi.mocked(openPdf).mockResolvedValue(fakePdf(2));
    const closes: ReturnType<typeof vi.fn>[] = [];
    vi.mocked(renderPage).mockImplementation(async () => {
      const close = vi.fn();
      closes.push(close);
      return { width: 10, height: 10, close };
    });
    const { result } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const first = result.current.image;
    act(() => result.current.setPage(2));
    act(() => result.current.setPage(1));
    expect(result.current.image).toBeNull();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.image).not.toBe(first);
    expect(closes[0]).toHaveBeenCalled();
    expect(closes.at(-1)).not.toHaveBeenCalled();
  });

  it("frees the document when the dialog goes away", async () => {
    const pdf = { ...fakePdf(), destroy: vi.fn(async () => {}) };
    vi.mocked(openPdf).mockResolvedValue(pdf);
    const { result, unmount } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    unmount();
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it("frees a document that opens after the dialog has gone", async () => {
    const pdf = { ...fakePdf(), destroy: vi.fn(async () => {}) };
    let open!: (p: typeof pdf) => void;
    vi.mocked(openPdf).mockReturnValue(new Promise((resolve) => (open = resolve)));
    const { unmount } = renderHook(() => usePlanDocument(doc()));
    unmount();
    await act(async () => open(pdf));
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it("closes a late image from the previous page without publishing its controls", async () => {
    vi.mocked(openPdf).mockResolvedValue(fakePdf(2));
    let finish!: (image: ImageBitmap) => void;
    const late = { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap;
    const next = { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(renderPage)
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce(next);
    const { result } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.image).toBe(next));
    const controls = result.current.controls;
    await act(async () => finish(late));
    expect(late.close).toHaveBeenCalledOnce();
    expect(result.current.image).toBe(next);
    expect(result.current.controls).toBe(controls);
  });

  it("retains the rendered image until cleanup when control point extraction fails", async () => {
    vi.mocked(openPdf).mockResolvedValue(fakePdf());
    const image = { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(renderPage).mockResolvedValue(image);
    vi.mocked(controlPoints).mockImplementationOnce(() => {
      throw new Error("bad text");
    });
    const { result, unmount } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.image).toBeNull();
    expect(image.close).not.toHaveBeenCalled();
    unmount();
    expect(image.close).toHaveBeenCalledOnce();
  });

  it("reports a document that cannot be opened", async () => {
    vi.mocked(openPdf).mockRejectedValue(new Error("bad pdf"));
    const { result } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.image).toBeNull();
  });
});
