import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPEN_DELAY, resetTooltipWarmup, useTooltip } from "./use-tooltip";

const mouseEnter = { pointerType: "mouse" } as PointerEvent;

beforeEach(() => {
  vi.useFakeTimers();
  resetTooltipWarmup();
});
afterEach(() => vi.useRealTimers());

describe("useTooltip", () => {
  it("does not warm the next tooltip when the pointer left before this one opened", () => {
    const first = renderHook(() => useTooltip());
    act(() => first.result.current.triggerProps.onPointerEnter(mouseEnter));
    act(() => first.result.current.triggerProps.onPointerLeave());
    const second = renderHook(() => useTooltip());
    act(() => second.result.current.triggerProps.onPointerEnter(mouseEnter));
    expect(second.result.current.open).toBe(false);
    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    expect(second.result.current.open).toBe(true);
    expect(first.result.current.open).toBe(false);
  });

  it("drops a pending open when the trigger unmounts", () => {
    const hook = renderHook(() => useTooltip());
    act(() => hook.result.current.triggerProps.onPointerEnter(mouseEnter));
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
