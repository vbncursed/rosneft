import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanRect } from "@/entities/site-plan";
import { usePlanPreview, type PlanPreviewParams } from "./use-plan-preview";

const rect = (x: number): PlanRect => ({
  corners: [
    { x, y: 0 },
    { x: x + 10, y: 0 },
    { x: x + 10, y: 10 },
    { x, y: 10 },
  ],
  widthPt: 10,
  heightPt: 10,
  angle: 0,
});
const RECTS = [rect(0), rect(50), rect(100)];
const FIT = { scale: 0.1, rotation: 0, tx: 0, tz: 0 };
const groundAt = () => 1;
const NO_ZONES: PlanPreviewParams["zones"] = [];
const selectRect = vi.fn();
const params = (over: Partial<PlanPreviewParams> = {}): PlanPreviewParams => ({
  rects: RECTS,
  similarity: FIT,
  groundAt,
  fallbackY: 0,
  zones: NO_ZONES,
  unitRatio: 50,
  selected: null,
  label: null,
  selectRect,
  ...over,
});
const preview = (p: PlanPreviewParams) => renderHook((a: PlanPreviewParams) => usePlanPreview(a), { initialProps: p });

describe("usePlanPreview", () => {
  it("previews every rectangle once the fit is valid", () => {
    const { result } = preview(params());
    expect(result.current?.outlines.map((o) => o.index)).toEqual([0, 1, 2]);
  });

  it("previews nothing without a valid fit, and nothing without rectangles", () => {
    expect(preview(params({ similarity: null })).result.current).toBeNull();
    expect(preview(params({ rects: [] })).result.current).toBeNull();
  });

  it("drops the rectangle that already is a zone", () => {
    const zone = {
      id: 1,
      title: "z",
      corners: RECTS[1].corners.map((c) => ({ x: c.x * 0.1, y: 1, z: c.y * 0.1 })),
      tags: [],
      drawingWidthM: null,
      drawingHeightM: null,
      createdAt: "",
      updatedAt: "",
    } as unknown as PlanPreviewParams["zones"][number];
    const { result } = preview(params({ zones: [zone] }));
    expect(result.current?.outlines.map((o) => o.index)).toEqual([0, 2]);
  });

  it("keeps the very same object across a re-render of equal inputs, even with a fit rebuilt as a new object", () => {
    const { result, rerender } = preview(params());
    const first = result.current;
    rerender(params({ similarity: { ...FIT }, rects: RECTS }));
    expect(result.current).toBe(first);
  });

  it("keeps the same outlines when only the pick changes, and renews the object", () => {
    const { result, rerender } = preview(params());
    const first = result.current!;
    rerender(params({ selected: 1, label: "Rectangle" }));
    expect(result.current).not.toBe(first);
    expect(result.current!.outlines).toBe(first.outlines);
    expect([result.current!.selected, result.current!.label]).toEqual([1, "Rectangle"]);
  });

  it("recomputes when the fit moves", () => {
    const { result, rerender } = preview(params());
    const first = result.current!;
    rerender(params({ similarity: { ...FIT, tx: 5 } }));
    expect(result.current!.outlines).not.toBe(first.outlines);
  });

  it("hands the canvas one stable select that always calls the editor's latest", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { result, rerender } = preview(params({ selectRect: a }));
    const onSelect = result.current!.onSelect;
    rerender(params({ selectRect: b }));
    expect(result.current!.onSelect).toBe(onSelect);
    onSelect(2);
    expect(b).toHaveBeenCalledWith(2);
    expect(a).not.toHaveBeenCalled();
  });

  it("is steady for an editor that has no rectangles yet and builds a fresh empty list each render", () => {
    const { result, rerender } = preview(params({ rects: [] }));
    rerender(params({ rects: [] }));
    expect(result.current).toBeNull();
  });
});
