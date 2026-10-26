import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import { openPdf, renderPage } from "@/entities/site-plan";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { fakePdf, PLAN_PAGE } from "./plan-pdf.fixture";
import { usePlanImage } from "./use-plan-image";

vi.mock("@/entities/site-plan", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openPdf: vi.fn(),
  renderPage: vi.fn(),
}));

const doc = (page = 1): Document => ({
  id: 4,
  territorySlug: "t",
  title: "plan.pdf",
  sourceBlobHash: "h4",
  createdAt: "t0",
  calibration: { page, points: [] },
});

const close = vi.fn();
beforeEach(() => {
  close.mockReset();
  clearNotices();
  vi.mocked(openPdf).mockResolvedValue(fakePdf(2));
  vi.mocked(renderPage).mockResolvedValue({ width: 4096, height: 2893, close });
});

const read = (document: Document | null) =>
  renderHook((d: Document | null) => ({ plan: usePlanImage(d), notices: useNotices() }), { initialProps: document });

describe("usePlanImage", () => {
  it("renders the calibrated page and reports its size in points", async () => {
    const { result } = read(doc());
    expect(result.current.plan).toBeNull();
    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(openPdf).toHaveBeenCalledWith("/api/assets/h4");
    expect(result.current.plan?.page).toEqual({ width: PLAN_PAGE.width, height: PLAN_PAGE.height });
  });

  it("reads nothing for no document", () => {
    const { result } = read(null);
    expect(result.current.plan).toBeNull();
    expect(openPdf).not.toHaveBeenCalled();
  });

  it("lets go of the picture when the document goes", async () => {
    const { result, rerender } = read(doc());
    await waitFor(() => expect(result.current.plan).not.toBeNull());
    rerender(null);
    expect(close).toHaveBeenCalledOnce();
    expect(result.current.plan).toBeNull();
  });

  it("says so when the plan cannot be read, once", async () => {
    vi.mocked(openPdf).mockRejectedValue(new Error("bad pdf"));
    const { result } = read(doc());
    await waitFor(() => expect(result.current.notices).toHaveLength(1));
    expect(result.current.notices[0].message).toBe("The plan could not be read.");
    expect(result.current.plan).toBeNull();
  });
});
