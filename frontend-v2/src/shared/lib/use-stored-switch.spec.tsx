import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStoredSwitch } from "./use-stored-switch";

const KEY = "andrey.test-switch";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("useStoredSwitch", () => {
  it("is on until someone says otherwise", () => {
    const { result } = renderHook(() => useStoredSwitch(KEY));
    expect(result.current[0]).toBe(true);
  });

  it("remembers that it was switched off, under its own key", () => {
    const { result } = renderHook(() => useStoredSwitch(KEY));
    act(() => result.current[1]());

    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("hidden");
    expect(renderHook(() => useStoredSwitch(KEY)).result.current[0]).toBe(false);
    expect(renderHook(() => useStoredSwitch("andrey.other")).result.current[0]).toBe(true);
  });

  it("forgets it again when switched back on", () => {
    localStorage.setItem(KEY, "hidden");
    const { result } = renderHook(() => useStoredSwitch(KEY));
    act(() => result.current[1]());

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("writes once per toggle under StrictMode", () => {
    // StrictMode runs updaters twice; a write inside one would run twice too.
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useStoredSwitch(KEY), { wrapper });
    act(() => result.current[1]());

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe(false);
  });

  it("still answers when storage is blocked", () => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      });
    }

    const { result } = renderHook(() => useStoredSwitch(KEY));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });
});
