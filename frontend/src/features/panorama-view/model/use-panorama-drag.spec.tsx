import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePanoramaDrag } from "./use-panorama-drag";

const POINT = { x: 1, y: 0, z: -2 };

const setup = () => {
  const onCommit = vi.fn();
  return { ...renderHook(() => usePanoramaDrag(onCommit)), onCommit };
};

describe("usePanoramaDrag", () => {
  it("idles until a marker is grabbed", () => {
    const { result } = setup();
    expect(result.current.draggingId).toBeNull();
    expect(result.current.livePos).toBeNull();
  });

  it("tracks the grabbed marker and the surface point under it", () => {
    const { result } = setup();
    act(() => result.current.begin(7));
    expect(result.current.draggingId).toBe(7);

    act(() => result.current.move(POINT));
    expect(result.current.livePos).toEqual(POINT);
  });

  it("commits the drop once and goes back to idle", () => {
    const { result, onCommit } = setup();
    act(() => result.current.begin(7));
    act(() => result.current.move(POINT));
    act(() => result.current.end());

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(7, POINT);
    expect(result.current.draggingId).toBeNull();
    expect(result.current.livePos).toBeNull();
  });

  it("commits nothing for a grab that never moved — that is a click", () => {
    const { result, onCommit } = setup();
    act(() => result.current.begin(7));
    act(() => result.current.end());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ignores a move while nothing is grabbed", () => {
    const { result, onCommit } = setup();
    act(() => result.current.move(POINT));
    expect(result.current.livePos).toBeNull();

    act(() => result.current.end());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("reset drops an in-flight drag without persisting it", () => {
    // Leaving move mode — V again, or Escape — must not save where the pointer
    // happened to be.
    const { result, onCommit } = setup();
    act(() => result.current.begin(7));
    act(() => result.current.move(POINT));
    act(() => result.current.reset());

    expect(result.current.draggingId).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
