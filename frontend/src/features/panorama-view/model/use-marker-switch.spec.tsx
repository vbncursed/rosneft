import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarkerSwitch } from "./use-marker-switch";

const KEY = "andrey.panorama-markers";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("useMarkerSwitch", () => {
  it("draws points and names until someone says otherwise", () => {
    expect(renderHook(() => useMarkerSwitch()).result.current.mode).toBe("all");
  });

  it("remembers Points only under the same key", () => {
    const { result } = renderHook(() => useMarkerSwitch());
    act(() => result.current.setMode("points"));
    expect(result.current.mode).toBe("points");
    expect(localStorage.getItem(KEY)).toBe("points");
    expect(renderHook(() => useMarkerSwitch()).result.current.mode).toBe("points");
  });

  it("stores Off as the word the old switch wrote", () => {
    const { result } = renderHook(() => useMarkerSwitch());
    act(() => result.current.setMode("off"));
    expect(result.current.mode).toBe("off");
    expect(localStorage.getItem(KEY)).toBe("hidden");
  });

  // A browser that hid the markers before the third state keeps its choice.
  it('reads a browser\'s old "hidden" as Off', () => {
    localStorage.setItem(KEY, "hidden");
    expect(renderHook(() => useMarkerSwitch()).result.current.mode).toBe("off");
  });

  it("forgets the entry when set back to Points & names", () => {
    localStorage.setItem(KEY, "points");
    const { result } = renderHook(() => useMarkerSwitch());
    act(() => result.current.setMode("all"));
    expect(result.current.mode).toBe("all");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("reads a value it does not know as Points & names", () => {
    localStorage.setItem(KEY, "sideways");
    expect(renderHook(() => useMarkerSwitch()).result.current.mode).toBe("all");
  });

  it("still answers when storage is blocked", () => {
    // A private window throws on both read and write; a remembered switch is a
    // convenience, not something to fail the viewer over.
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      });
    }
    const { result } = renderHook(() => useMarkerSwitch());
    expect(result.current.mode).toBe("all");
    act(() => result.current.setMode("points"));
    expect(result.current.mode).toBe("points");
  });
});
