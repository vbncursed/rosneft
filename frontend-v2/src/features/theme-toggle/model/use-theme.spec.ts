import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const media = (light: boolean) => vi.fn().mockReturnValue({ matches: light } as MediaQueryList);

// The theme lives in a module-level store, so each case needs the module read
// afresh — that first read is where the remembered choice and the OS
// preference are consulted.
const load = async () => {
  vi.resetModules();
  return await import("./use-theme");
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("systemTheme", () => {
  it("follows the OS preference", async () => {
    vi.stubGlobal("matchMedia", media(true));
    expect((await load()).systemTheme()).toBe("light");

    vi.stubGlobal("matchMedia", media(false));
    expect((await load()).systemTheme()).toBe("dark");
  });
});

describe("useTheme", () => {
  it("starts from the OS preference when nothing was chosen before", async () => {
    vi.stubGlobal("matchMedia", media(true));
    const { useTheme } = await load();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("prefers a remembered choice over the OS", async () => {
    vi.stubGlobal("matchMedia", media(true));
    localStorage.setItem("andrey.theme", "dark");
    const { useTheme } = await load();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("ignores a value it does not recognise", async () => {
    vi.stubGlobal("matchMedia", media(false));
    localStorage.setItem("andrey.theme", "neon");
    const { useTheme } = await load();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("stamps the choice on the document and remembers it", async () => {
    vi.stubGlobal("matchMedia", media(false));
    const { useTheme } = await load();
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("andrey.theme")).toBe("light");
  });

  it("still works when storage is unavailable", async () => {
    vi.stubGlobal("matchMedia", media(false));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { useTheme } = await load();
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("two instances agree after one of them toggles", async () => {
    // The whole point of the store: the sidebar's toggle and the 3D canvas are
    // different components, and the scene has to hear about the flip.
    vi.stubGlobal("matchMedia", media(false));
    const { useTheme } = await load();
    const sidebar = renderHook(() => useTheme());
    const canvas = renderHook(() => useTheme());
    expect(canvas.result.current.theme).toBe("dark");

    act(() => sidebar.result.current.toggle());
    expect(sidebar.result.current.theme).toBe("light");
    expect(canvas.result.current.theme).toBe("light");
  });

  it("lets go of a consumer that unmounted", async () => {
    vi.stubGlobal("matchMedia", media(false));
    const { useTheme } = await load();
    const gone = renderHook(() => useTheme());
    const staying = renderHook(() => useTheme());
    gone.unmount();

    act(() => staying.result.current.toggle());
    expect(staying.result.current.theme).toBe("light");
  });
});
