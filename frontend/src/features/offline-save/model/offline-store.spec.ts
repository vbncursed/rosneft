import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge, OfflineProgress } from "@/shared/lib/desktop";
import { offlineActions, resetOfflineStore, useOfflineTerritory } from "./offline-store";

const saved = { slug: "a", title: "A", bytes: 10, savedAt: "t", syncedAt: "t" };

function bridge() {
  let push: (p: OfflineProgress) => void = () => {};
  const offline = {
    list: vi.fn(async () => [saved]),
    save: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    onProgress: vi.fn((cb: (p: OfflineProgress) => void) => ((push = cb), () => {})),
  };
  window.desktop = { passkeys: false, offline } as unknown as DesktopBridge;
  return { offline, push: (p: OfflineProgress) => push(p) };
}

afterEach(() => {
  delete window.desktop;
  resetOfflineStore();
});

describe("offline store", () => {
  it("loads what is saved", async () => {
    bridge();
    const { result } = renderHook(() => useOfflineTerritory("a"));
    await waitFor(() => expect(result.current.saved).toEqual(saved));
  });
  it("tracks progress and reloads the list when a save ends", async () => {
    const b = bridge();
    const { result } = renderHook(() => useOfflineTerritory("b"));
    act(() => b.push({ slug: "b", state: "saving", done: 1, total: 2 }));
    expect(result.current.progress?.done).toBe(1);
    act(() => b.push({ slug: "b", state: "saved", done: 2, total: 2 }));
    expect(result.current.progress).toBeUndefined();
    await waitFor(() => expect(b.offline.list).toHaveBeenCalledTimes(2));
  });
  it("keeps a failure on screen until the next attempt", () => {
    const b = bridge();
    const { result } = renderHook(() => useOfflineTerritory("b"));
    act(() => b.push({ slug: "b", state: "failed", done: 0, total: 0, error: "network" }));
    expect(result.current.progress?.error).toBe("network");
  });
  it("passes actions to the shell", async () => {
    const b = bridge();
    offlineActions.save("a");
    offlineActions.cancel("a");
    await offlineActions.remove("a");
    expect(b.offline.save).toHaveBeenCalledWith("a");
    expect(b.offline.cancel).toHaveBeenCalledWith("a");
    expect(b.offline.remove).toHaveBeenCalledWith("a");
  });
});
