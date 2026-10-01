import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetOfflineStore } from "@/features/offline-save";
import type { DesktopBridge } from "@/shared/lib/desktop";
import { useDeviceStorage } from "./use-device-storage";

const { error } = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/shared/lib/notify", () => ({ notify: { error } }));

const usage = { used: 1, pinned: 0, limit: 10 };
function bridge(over: Partial<{ usage: () => Promise<typeof usage>; setLimit: () => Promise<void> }> = {}) {
  const storage = {
    usage: vi.fn(over.usage ?? (async () => usage)),
    setLimit: vi.fn(over.setLimit ?? (async () => {})),
    clearCache: vi.fn(async () => {}),
  };
  const offline = { list: vi.fn(async () => []), onProgress: vi.fn(() => () => {}), remove: vi.fn(async () => {}) };
  window.desktop = { passkeys: false, storage, offline } as unknown as DesktopBridge;
  return storage;
}
afterEach(() => {
  delete window.desktop;
  resetOfflineStore();
  error.mockReset();
});

describe("useDeviceStorage", () => {
  it("reads usage, and is neither failed nor loaded-empty before it answers", async () => {
    bridge();
    const { result } = renderHook(() => useDeviceStorage());
    expect(result.current.usage).toBeNull();
    expect(result.current.usageFailed).toBe(false);
    await waitFor(() => expect(result.current.usage).toEqual(usage));
    await waitFor(() => expect(result.current.savedLoaded).toBe(true));
  });

  it("flags usage as failed when the shell rejects it", async () => {
    bridge({ usage: async () => Promise.reject(new Error("pins.json corrupt")) });
    const { result } = renderHook(() => useDeviceStorage());
    await waitFor(() => expect(result.current.usageFailed).toBe(true));
    expect(result.current.usage).toBeNull();
  });

  it("re-reads usage after a limit change and a clear", async () => {
    const storage = bridge();
    const { result } = renderHook(() => useDeviceStorage());
    await act(() => result.current.setLimit(5));
    await act(() => result.current.clear());
    expect(storage.setLimit).toHaveBeenCalledWith(5);
    expect(storage.clearCache).toHaveBeenCalled();
    await waitFor(() => expect(storage.usage.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("toasts a refused setting instead of throwing", async () => {
    bridge({ setLimit: async () => Promise.reject(new Error("bad limit")) });
    const { result } = renderHook(() => useDeviceStorage());
    await act(() => result.current.setLimit(5));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Could not change the storage limit"));
  });
});
