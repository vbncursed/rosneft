import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ViewerMode, ViewerView } from "@/features/viewer-mode";
import { useFlyAround } from "./use-fly-around";

type Where = { mode: ViewerMode; view: ViewerView["kind"] };

const mount = () =>
  renderHook(({ mode, view }: Where) => useFlyAround(mode, view), {
    initialProps: { mode: "orbit", view: "scene" } as Where,
  });

describe("useFlyAround", () => {
  it("starts grounded, and the toggle takes off and lands", () => {
    const { result } = mount();
    expect(result.current.playing).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
  });

  it("lands on stop, which Reset and the rig's grab both use", () => {
    const { result } = mount();
    act(() => result.current.toggle());
    act(() => result.current.stop());
    expect(result.current.playing).toBe(false);
  });

  it("keeps flying through a render that changes nothing", () => {
    const { result, rerender } = mount();
    act(() => result.current.toggle());
    rerender({ mode: "orbit", view: "scene" });
    expect(result.current.playing).toBe(true);
  });

  it("lands on a mode change, and coming back to orbit does not take off again", () => {
    const { result, rerender } = mount();
    act(() => result.current.toggle());
    rerender({ mode: "measure", view: "scene" });
    expect(result.current.playing).toBe(false);
    rerender({ mode: "orbit", view: "scene" });
    expect(result.current.playing).toBe(false);
  });

  it("lands on stepping into a panorama", () => {
    const { result, rerender } = mount();
    act(() => result.current.toggle());
    rerender({ mode: "orbit", view: "panorama" });
    expect(result.current.playing).toBe(false);
  });

  it("hands out stable callbacks — they are props on the WebGL tree", () => {
    const { result, rerender } = mount();
    const first = result.current;
    act(() => result.current.toggle());
    rerender({ mode: "orbit", view: "scene" });
    expect(result.current.toggle).toBe(first.toggle);
    expect(result.current.stop).toBe(first.stop);
  });
});
