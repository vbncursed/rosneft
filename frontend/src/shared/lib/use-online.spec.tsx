import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "./desktop";

afterEach(() => {
  delete window.desktop;
  vi.resetModules();
});

describe("useOnline", () => {
  it("is true in a browser", async () => {
    const { useOnline } = await import("./use-online");
    expect(renderHook(() => useOnline()).result.current).toBe(true);
  });
  it("follows the shell's connectivity reports", async () => {
    let report: (online: boolean) => void = () => {};
    window.desktop = {
      onConnectivity: (cb: (o: boolean) => void) => ((report = cb), () => {}),
    } as unknown as DesktopBridge;
    const { useOnline } = await import("./use-online");
    const { result } = renderHook(() => useOnline());
    act(() => report(false));
    expect(result.current).toBe(false);
    act(() => report(true));
    expect(result.current).toBe(true);
  });
});
