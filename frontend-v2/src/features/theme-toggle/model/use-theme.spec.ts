import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { systemTheme, useTheme } from "./use-theme";

const media = (light: boolean) =>
  vi.fn().mockReturnValue({ matches: light } as MediaQueryList);

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("systemTheme", () => {
  it("follows the OS preference", () => {
    vi.stubGlobal("matchMedia", media(true));
    expect(systemTheme()).toBe("light");

    vi.stubGlobal("matchMedia", media(false));
    expect(systemTheme()).toBe("dark");
  });
});

describe("useTheme", () => {
  it("starts from the OS preference when nothing was chosen before", () => {
    vi.stubGlobal("matchMedia", media(true));
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("prefers a remembered choice over the OS", () => {
    vi.stubGlobal("matchMedia", media(true));
    localStorage.setItem("andrey.theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("ignores a value it does not recognise", () => {
    vi.stubGlobal("matchMedia", media(false));
    localStorage.setItem("andrey.theme", "neon");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("stamps the choice on the document and remembers it", () => {
    vi.stubGlobal("matchMedia", media(false));
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("andrey.theme")).toBe("light");
  });

  it("still works when storage is unavailable", () => {
    vi.stubGlobal("matchMedia", media(false));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
