import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOverlaysPanel } from "./use-overlays-panel";

const KEY = "andrey.overlays";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useOverlaysPanel", () => {
  it("starts on the view tab, expanded", () => {
    const { result } = renderHook(() => useOverlaysPanel(null, undefined, false));
    expect(result.current.tab).toBe("view");
    expect(result.current.collapsed).toBe(false);
  });

  it("switches to placements when a placement is selected", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: number | null }) => useOverlaysPanel(id, undefined, false),
      { initialProps: { id: null as number | null } },
    );
    rerender({ id: 7 });
    expect(result.current.tab).toBe("placements");
  });

  it("stays where it is when the selection clears", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: number | null }) => useOverlaysPanel(id, undefined, false),
      { initialProps: { id: 7 as number | null } },
    );
    act(() => {
      result.current.setTab("view");
    });
    rerender({ id: null });
    expect(result.current.tab).toBe("view");
  });

  it("lets a forced tab override the chosen one", () => {
    const { result } = renderHook(() => useOverlaysPanel(null, "placements", false));
    expect(result.current.tab).toBe("placements");
    act(() => {
      result.current.setTab("view");
    });
    expect(result.current.tab).toBe("placements");
  });

  it("remembers a collapse and forgets it on expand", () => {
    const { result } = renderHook(() => useOverlaysPanel(null, undefined, false));
    act(() => {
      result.current.setCollapsed(true);
    });
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("collapsed");

    act(() => {
      result.current.setCollapsed(false);
    });
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("starts collapsed when that is what was remembered", () => {
    localStorage.setItem(KEY, "collapsed");
    const { result } = renderHook(() => useOverlaysPanel(null, undefined, false));
    expect(result.current.collapsed).toBe(true);
  });

  it("forces the panel open without forgetting the remembered collapse", () => {
    localStorage.setItem(KEY, "collapsed");
    const { result } = renderHook(() => useOverlaysPanel(null, undefined, true));
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("collapsed");
  });

  it("falls back to expanded when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked site data");
    });
    const { result } = renderHook(() => useOverlaysPanel(null, undefined, false));
    expect(result.current.collapsed).toBe(false);
  });

  it("survives a localStorage that refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useOverlaysPanel(null, undefined, false));
    act(() => {
      result.current.setCollapsed(true);
    });
    expect(result.current.collapsed).toBe(true);
  });
});
