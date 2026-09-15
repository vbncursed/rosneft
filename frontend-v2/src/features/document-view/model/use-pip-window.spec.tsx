import { act, fireEvent, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it } from "vitest";
import { dock } from "./pip-geometry";
import { usePipWindow } from "./use-pip-window";

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

const pointerDown = (clientX: number, clientY: number) =>
  ({ clientX, clientY, preventDefault: () => {} }) as unknown as ReactPointerEvent<HTMLElement>;

describe("usePipWindow", () => {
  it("starts docked bottom-right at the given inset", () => {
    const { result } = renderHook(() => usePipWindow(14));
    expect(result.current.geo).toEqual(dock(viewport(), 14));
  });

  it("moves the geometry while a move drag tracks the pointer", () => {
    const { result } = renderHook(() => usePipWindow(14));
    const start = result.current.geo;

    act(() => result.current.startMove(pointerDown(100, 100)));
    expect(result.current.dragging).toBe(true);

    // Docked bottom-right, so only left/up have real room before the pure
    // clamp (covered exhaustively in pip-geometry.spec.ts) would engage.
    act(() => {
      fireEvent.pointerMove(window, { clientX: 70, clientY: 80 });
    });
    expect(result.current.geo).toEqual({ ...start, x: start.x - 30, y: start.y - 20 });
  });

  it("pointerup ends the drag and detaches the listeners", () => {
    const { result } = renderHook(() => usePipWindow(14));
    act(() => result.current.startMove(pointerDown(0, 0)));

    act(() => {
      fireEvent.pointerUp(window);
    });
    expect(result.current.dragging).toBe(false);

    const after = result.current.geo;
    act(() => {
      fireEvent.pointerMove(window, { clientX: 999, clientY: 999 });
    });
    expect(result.current.geo).toEqual(after);
  });

  it("startResize grows the window from its fixed corner", () => {
    const { result } = renderHook(() => usePipWindow(14));
    const start = result.current.geo;

    act(() => result.current.startResize(pointerDown(0, 0)));
    // Docked at the inset, so only a few px of room remain before the pure
    // clamp (covered exhaustively in pip-geometry.spec.ts) would engage.
    act(() => {
      fireEvent.pointerMove(window, { clientX: 5, clientY: 5 });
    });

    expect(result.current.geo).toEqual({ ...start, w: start.w + 5, h: start.h + 5 });
  });

  it("detaches its listeners on unmount mid-drag — a later pointermove is a no-op", () => {
    const { result, unmount } = renderHook(() => usePipWindow(14));
    act(() => result.current.startMove(pointerDown(0, 0)));

    unmount();
    expect(() => {
      fireEvent.pointerMove(window, { clientX: 500, clientY: 500 });
    }).not.toThrow();
  });

  it("re-clamps an off-screen window back inside on a window resize", () => {
    const { result } = renderHook(() => usePipWindow(14));
    const originalW = window.innerWidth;
    const originalH = window.innerHeight;

    try {
      // Shrink the viewport under the window's docked position, but still
      // bigger than the window itself (560x400) — the window fits, it just
      // has to move back onto the new, smaller screen.
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 450 });

      act(() => {
        fireEvent(window, new Event("resize"));
      });

      expect(result.current.geo.x).toBeGreaterThanOrEqual(0);
      expect(result.current.geo.y).toBeGreaterThanOrEqual(0);
      expect(result.current.geo.x).toBeLessThanOrEqual(window.innerWidth - result.current.geo.w);
      expect(result.current.geo.y).toBeLessThanOrEqual(window.innerHeight - result.current.geo.h);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalW });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalH });
    }
  });

  it("pins to the top-left corner — never negative — when the viewport shrinks below the window's own size", () => {
    const { result } = renderHook(() => usePipWindow(14));
    const originalW = window.innerWidth;
    const originalH = window.innerHeight;

    try {
      // Narrower and shorter than the 560x400 window itself: viewport minus
      // size is negative on both axes, and 0 must win, not that negative.
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 460 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 364 });

      act(() => {
        fireEvent(window, new Event("resize"));
      });

      expect(result.current.geo).toEqual({ x: 0, y: 0, w: 560, h: 400 });
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalW });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalH });
    }
  });
});
