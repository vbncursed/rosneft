import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLodHandlers } from "./use-lod-handlers";

const mount = (land = vi.fn()) => ({ land, ...renderHook(() => useLodHandlers({ land })) });

describe("useLodHandlers", () => {
  it("starts with nothing reported and no retry or reset pending", () => {
    const { result } = mount();
    expect(result.current).toMatchObject({
      report: { shown: null, target: null, percent: null, progressText: null, failure: null },
      failedAt: null,
      retryVersion: 0,
      resetVersion: 0,
    });
  });

  it("stamps the clock when a failure lands, and leaves it there while the same one is reported", () => {
    const { result } = mount();
    act(() =>
      result.current.onLod({
        shown: null,
        target: 0,
        percent: null,
        progressText: null,
        failure: { hash: "h1", status: 502 },
      }),
    );
    const stamped = result.current.failedAt;
    expect(stamped).not.toBeNull();

    act(() =>
      result.current.onLod({
        shown: null,
        target: 0,
        percent: null,
        progressText: null,
        failure: { hash: "h1", status: 502 },
      }),
    );
    expect(result.current.failedAt).toBe(stamped);
  });

  it("clears the failure clock once a report with no failure lands", () => {
    const { result } = mount();
    act(() =>
      result.current.onLod({
        shown: null,
        target: 0,
        percent: null,
        progressText: null,
        failure: { hash: "h1", status: 502 },
      }),
    );
    act(() => result.current.onLod({ shown: 0, target: 0, percent: 100, progressText: null, failure: null }));
    expect(result.current.failedAt).toBeNull();
  });

  it("lands the flight and bumps the reset version on Reset", () => {
    const land = vi.fn();
    const { result } = mount(land);
    act(() => result.current.onReset());
    expect(land).toHaveBeenCalled();
    expect(result.current.resetVersion).toBe(1);
  });

  it("bumps the retry version on Retry", () => {
    const { result } = mount();
    act(() => result.current.onRetry());
    expect(result.current.retryVersion).toBe(1);
  });

  it("keeps onLod, onReset and onRetry stable across a re-render", () => {
    const { result, rerender } = mount();
    const first = result.current;
    act(() => result.current.onReset());
    rerender();
    expect(result.current.onLod).toBe(first.onLod);
    expect(result.current.onReset).toBe(first.onReset);
    expect(result.current.onRetry).toBe(first.onRetry);
  });
});
