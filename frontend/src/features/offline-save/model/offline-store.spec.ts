import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import type { DesktopBridge, OfflineProgress } from "@/shared/lib/desktop";
import { offlineActions, resetOfflineStore, syncOfflineUser, useOfflineState, useOfflineTerritory, useOfflineUser, useSavedTerritories } from "./offline-store";

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
  clearNotices();
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
  it("reports a refused removal once instead of rejecting", async () => {
    const b = bridge();
    b.offline.remove.mockRejectedValue(new Error("EBUSY"));
    const { result } = renderHook(() => useNotices());
    await expect(offlineActions.remove("a")).resolves.toBeUndefined();
    expect(result.current.map((n) => n.message)).toEqual(["Could not remove the territory from this device: Something went wrong. Try again."]);
  });
  it("survives a list that fails after a removal", async () => {
    const b = bridge();
    b.offline.list.mockRejectedValue(new Error("down"));
    await expect(offlineActions.remove("a")).resolves.toBeUndefined();
    expect(b.offline.remove).toHaveBeenCalledWith("a");
  });
  it("is not loaded until the first list answers, and forgets that on reset", async () => {
    bridge();
    const { result } = renderHook(() => useOfflineState());
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    resetOfflineStore();
    expect(renderHook(() => useOfflineState()).result.current.loaded).toBe(false);
  });
  it("re-reads when the signed-in user changes, and the previous user's list is gone at once", async () => {
    const b = bridge();
    const { result, rerender } = renderHook(({ id }) => ({ list: useSavedTerritories(), user: useOfflineUser(id) }), { initialProps: { id: "u1" } });
    await waitFor(() => expect(result.current.list.map((t) => t.slug)).toEqual(["a"]));
    let answer!: (v: unknown[]) => void;
    b.offline.list.mockImplementation(() => new Promise((r) => (answer = r as typeof answer)));
    rerender({ id: "u2" });
    expect(result.current.list).toEqual([]);
    await act(async () => answer([{ ...saved, slug: "z" }]));
    expect(result.current.list.map((t) => t.slug)).toEqual(["z"]);
  });
  it("a list that answers after the account changed is dropped", async () => {
    const b = bridge();
    const answers: ((v: unknown[]) => void)[] = [];
    b.offline.list.mockImplementation(() => new Promise((r) => answers.push(r as (v: unknown[]) => void)));
    const { result } = renderHook(() => useSavedTerritories());
    syncOfflineUser("u1");
    syncOfflineUser("u2");
    await act(async () => {
      answers.at(-1)!([{ ...saved, slug: "new" }]);
      answers[0]!([{ ...saved, slug: "old" }]);
    });
    expect(result.current.map((t) => t.slug)).toEqual(["new"]);
  });
  it("the same user again does not re-read", async () => {
    const b = bridge();
    syncOfflineUser("u1");
    syncOfflineUser("u1");
    syncOfflineUser(undefined);
    expect(b.offline.list).toHaveBeenCalledTimes(1);
  });
  it("an IPC rejection from save or cancel is swallowed", async () => {
    const b = bridge();
    b.offline.save.mockRejectedValue(new Error("gone"));
    b.offline.cancel.mockRejectedValue(new Error("gone"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    offlineActions.save("a");
    offlineActions.cancel("a");
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
