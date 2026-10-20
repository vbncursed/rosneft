import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ViewerMode, ViewerView } from "@/features/viewer-mode";
import { useFlyAround } from "./use-fly-around";

type Where = { mode: ViewerMode; view: ViewerView["kind"]; free: boolean };

const mount = () =>
  renderHook(({ mode, view, free }: Where) => useFlyAround(mode, view, free), {
    initialProps: { mode: "orbit", view: "scene", free: false },
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
    rerender({ mode: "orbit", view: "scene", free: false });
    expect(result.current.playing).toBe(true);
  });

  it("lands on a mode change, and coming back to orbit does not take off again", () => {
    const { result, rerender } = mount();
    act(() => result.current.toggle());
    rerender({ mode: "measure", view: "scene", free: false });
    expect(result.current.playing).toBe(false);
    rerender({ mode: "orbit", view: "scene", free: false });
    expect(result.current.playing).toBe(false);
  });

  it("lands on stepping into a panorama", () => {
    const { result, rerender } = mount();
    act(() => result.current.toggle());
    rerender({ mode: "orbit", view: "panorama", free: false });
    expect(result.current.playing).toBe(false);
  });

  it("lands when the free cam takes the camera, and leaving it does not take off", () => {
    const { result, rerender } = mount();
    act(() => result.current.toggle());
    rerender({ mode: "orbit", view: "scene", free: true });
    expect(result.current.playing).toBe(false);
    rerender({ mode: "orbit", view: "scene", free: false });
    expect(result.current.playing).toBe(false);
  });

  it("is free to take off again once the free cam is left", () => {
    const { result, rerender } = mount();
    rerender({ mode: "orbit", view: "scene", free: true });
    rerender({ mode: "orbit", view: "scene", free: false });
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(true);
  });

  it("hands out stable callbacks — they are props on the WebGL tree", () => {
    const { result, rerender } = mount();
    const first = result.current;
    act(() => result.current.toggle());
    rerender({ mode: "orbit", view: "scene", free: false });
    expect(result.current.toggle).toBe(first.toggle);
    expect(result.current.stop).toBe(first.stop);
  });
});
