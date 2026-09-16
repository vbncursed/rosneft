import { act, fireEvent, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { dock } from "./pip-geometry";
import { usePipWindow } from "./use-pip-window";

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

/** A stand-in for the floating layer: jsdom lays nothing out, so say the size. */
const layer = (w: number, h: number) => {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { configurable: true, value: w });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: h });
  document.body.appendChild(el);
  return { current: el };
};

const pointerDown = (clientX: number, clientY: number, setPointerCapture = vi.fn()) =>
  ({
    clientX,
    clientY,
    pointerId: 7,
    currentTarget: { setPointerCapture },
    preventDefault: () => {},
  }) as unknown as ReactPointerEvent<HTMLElement>;

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

  // Without capture the grip lost the pointer the moment it left the 14px
  // handle: the cursor fell back to an arrow while the window still followed.
  it("captures the pointer on the handle for the length of the drag", () => {
    const { result } = renderHook(() => usePipWindow(14));
    const capture = vi.fn();
    act(() => result.current.startMove(pointerDown(0, 0, capture)));
    expect(capture).toHaveBeenCalledWith(7);
  });

  it("a cancelled pointer ends the drag like a release", () => {
    const { result } = renderHook(() => usePipWindow(14));
    act(() => result.current.startResize(pointerDown(0, 0)));
    act(() => {
      fireEvent.pointerCancel(window);
    });
    expect(result.current.dragging).toBe(false);
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

  it("docks into the area it was handed, not into the browser window", () => {
    // The area is the viewport container minus the header, the stats-strip row
    // and the open Overlays panel. Docked against `window` instead, the whole
    // title-bar action cluster landed under the panel.
    const ref = layer(800, 600);
    const { result } = renderHook(() => usePipWindow(14, ref));
    expect(result.current.geo).toEqual(dock({ w: 800, h: 600 }, 14));
  });

  it("falls back to the browser window while the area cannot be measured", () => {
    const { result } = renderHook(() => usePipWindow(14, { current: null }));
    expect(result.current.geo).toEqual(dock(viewport(), 14));
  });

  it("pulls a placed window back inside when the area shrinks under it — it never re-docks", () => {
    // The Overlays panel unfolding is the area shrinking; a window already
    // placed is clamped, not sent back to the corner.
    const observers: (() => void)[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    try {
      const ref = layer(800, 600);
      const { result } = renderHook(() => usePipWindow(14, ref));
      act(() => result.current.startMove(pointerDown(100, 100)));
      act(() => {
        fireEvent.pointerMove(window, { clientX: 40, clientY: 100 });
      });
      act(() => {
        fireEvent.pointerUp(window);
      });
      const placed = result.current.geo;
      expect(placed.x).toBe(dock({ w: 800, h: 600 }, 14).x - 60);

      Object.defineProperty(ref.current, "clientWidth", { configurable: true, value: 500 });
      act(() => observers.forEach((cb) => cb()));

      expect(result.current.geo.x).toBe(0);
      expect(result.current.geo.y).toBe(placed.y);
    } finally {
      globalThis.ResizeObserver = original;
    }
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
