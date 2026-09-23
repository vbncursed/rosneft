import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePlacementHandlers, type PlacementHandlerDeps } from "./use-placement-handlers";

const mount = (selectedId: number | null = null) => {
  const mode = { state: { selectedId }, select: vi.fn() };
  const editor = { setHidden: vi.fn() };
  const openPicker = vi.fn();
  const d = { mode, editor, openPicker } as unknown as PlacementHandlerDeps;
  return { spies: { mode, editor, openPicker }, ...renderHook(() => usePlacementHandlers(d)) };
};

describe("usePlacementHandlers", () => {
  // §1.7: nothing hidden may stay selected — the gizmo would hold an object the scene no longer draws.
  it("drops the selection when it is among the placements hidden", () => {
    const { result, spies } = mount(4);
    act(() => result.current.onSetHidden([4, 5], true));
    expect(spies.mode.select).toHaveBeenCalledWith(null);
    expect(spies.editor.setHidden).toHaveBeenCalledWith([4, 5], true);
  });

  it("keeps the selection when something else is hidden, or when showing", () => {
    const { result, spies } = mount(4);
    act(() => result.current.onSetHidden([5], true));
    act(() => result.current.onSetHidden([4], false));
    expect(spies.mode.select).not.toHaveBeenCalled();
    expect(spies.editor.setHidden).toHaveBeenCalledTimes(2);
  });

  it("keeps nothing selected untouched", () => {
    const { result, spies } = mount(null);
    act(() => result.current.onSetHidden([4], true));
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
