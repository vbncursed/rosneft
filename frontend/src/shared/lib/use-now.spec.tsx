import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNow } from "./use-now";

afterEach(() => vi.useRealTimers());

describe("useNow", () => {
  it("reads the clock once and keeps that reading across re-renders", () => {
    vi.useFakeTimers({ now: new Date("2026-10-02T12:00:00Z") });
    const { result, rerender } = renderHook(() => useNow());
    const first = result.current;
    expect(first.toISOString()).toBe("2026-10-02T12:00:00.000Z");
    rerender();
    expect(result.current).toBe(first);
  });

  it("takes a new reading each interval", () => {
    vi.useFakeTimers({ now: new Date("2026-10-02T12:00:00Z") });
    const { result } = renderHook(() => useNow(1000));
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.toISOString()).toBe("2026-10-02T12:00:01.000Z");
  });

  it("stops ticking once unmounted", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useNow(1000));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
