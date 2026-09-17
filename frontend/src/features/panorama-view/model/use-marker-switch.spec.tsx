import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarkerSwitch } from "./use-marker-switch";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("useMarkerSwitch", () => {
  it("shows the markers until someone says otherwise", () => {
    const { result } = renderHook(() => useMarkerSwitch());
    expect(result.current.showMarkers).toBe(true);
  });

  it("remembers that they were hidden", () => {
    const { result } = renderHook(() => useMarkerSwitch());
    act(() => result.current.toggle());

    expect(result.current.showMarkers).toBe(false);
    expect(localStorage.getItem("andrey.panorama-markers")).toBe("hidden");
    expect(renderHook(() => useMarkerSwitch()).result.current.showMarkers).toBe(false);
  });

  it("forgets it again when they come back", () => {
    localStorage.setItem("andrey.panorama-markers", "hidden");
    const { result } = renderHook(() => useMarkerSwitch());
    act(() => result.current.toggle());

    expect(result.current.showMarkers).toBe(true);
    expect(localStorage.getItem("andrey.panorama-markers")).toBeNull();
  });

  it("still answers when storage is blocked", () => {
    // A private window throws on both read and write; a remembered switch is a
    // convenience, not something to fail the viewer over.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useMarkerSwitch());
    expect(result.current.showMarkers).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.showMarkers).toBe(false);
  });
});
