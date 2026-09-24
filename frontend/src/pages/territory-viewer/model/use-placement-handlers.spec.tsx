import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePlacementHandlers, type PlacementHandlerDeps } from "./use-placement-handlers";

const mount = (selectedId: number | null = null, landed = true) => {
  const mode = { state: { selectedId: selectedId as number | null }, select: vi.fn() };
  const editor = { setHidden: vi.fn(async () => landed) };
  const openPicker = vi.fn();
  const d = { mode, editor, openPicker } as unknown as PlacementHandlerDeps;
  return { spies: { mode, editor, openPicker }, ...renderHook(() => usePlacementHandlers(d)) };
};

describe("usePlacementHandlers", () => {
  // §1.7: nothing hidden may stay selected — the gizmo would hold an object the scene no longer draws.
  it("drops the selection once a hide covering it has landed, not before", async () => {
    let release!: (ok: boolean) => void;
    const { result, spies } = mount(4);
    spies.editor.setHidden.mockReturnValueOnce(new Promise<boolean>((res) => (release = res)));
    let done!: Promise<void>;
    act(() => {
      done = result.current.onSetHidden([4, 5], true);
    });
    expect(spies.editor.setHidden).toHaveBeenCalledWith([4, 5], true);
    expect(spies.mode.select).not.toHaveBeenCalled();
    await act(async () => {
      release(true);
      await done;
    });
    expect(spies.mode.select).toHaveBeenCalledWith(null);
  });

  it("leaves a selection made elsewhere while the hide was in flight", async () => {
    let release!: (ok: boolean) => void;
    const { result, spies, rerender } = mount(4);
    spies.editor.setHidden.mockReturnValueOnce(new Promise<boolean>((res) => (release = res)));
    let done!: Promise<void>;
    act(() => {
      done = result.current.onSetHidden([4], true);
    });
    spies.mode.state.selectedId = 7;
    rerender();
    await act(async () => {
      release(true);
      await done;
    });
    expect(spies.mode.select).not.toHaveBeenCalled();
  });

  // The object is still drawn after a refused hide; losing the selection too
  // would throw away the reader's place for nothing.
  it("keeps the selection when the hide fails", async () => {
    const { result, spies } = mount(4, false);
    await act(() => result.current.onSetHidden([4], true));
    expect(spies.mode.select).not.toHaveBeenCalled();
  });

  it("keeps the selection when something else is hidden, or when showing", async () => {
    const { result, spies } = mount(4);
    await act(() => result.current.onSetHidden([5], true));
    await act(() => result.current.onSetHidden([4], false));
    expect(spies.mode.select).not.toHaveBeenCalled();
    expect(spies.editor.setHidden).toHaveBeenCalledTimes(2);
  });

  it("keeps nothing selected untouched", async () => {
    const { result, spies } = mount(null);
    await act(() => result.current.onSetHidden([4], true));
    expect(spies.mode.select).not.toHaveBeenCalled();
  });

  it("aims the picker at a group, and a plain Add aims it back at No group", () => {
    const { result, spies } = mount();
    act(() => result.current.onAddToGroup(7));
    expect(result.current.placeGroupId).toBe(7);
    act(() => result.current.onAdd());
    expect(result.current.placeGroupId).toBeNull();
    expect(spies.openPicker).toHaveBeenCalledTimes(2);
  });
});
