import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPdfjs, openPdf, renderPage } from "@/entities/site-plan";
import type { Document } from "@/entities/document";
import { fakeLib, fakePdf, PLAN_PAGE } from "./plan-pdf.fixture";
import { usePlanDocument } from "./use-plan-document";

vi.mock("@/entities/site-plan", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPdfjs: vi.fn(),
  openPdf: vi.fn(),
  renderPage: vi.fn(),
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

  it("reports a document that cannot be opened", async () => {
    vi.mocked(openPdf).mockRejectedValue(new Error("bad pdf"));
    const { result } = renderHook(() => usePlanDocument(doc()));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.image).toBeNull();
  });
});
