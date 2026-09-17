import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./use-media-query";

type Listener = () => void;

/** A matchMedia stand-in whose `matches` can be flipped from a test. */
function stub(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    flip(next: boolean) {
      mql.matches = next;
      for (const fn of listeners) fn();
    },
    get subscribers() {
      return listeners.size;
    },
  };
}

describe("useMediaQuery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("answers what the query currently matches", () => {
    stub(true);
    expect(renderHook(() => useMediaQuery("(max-width: 1280px)")).result.current).toBe(true);
  });

  it("answers false when the query does not match", () => {
    stub(false);
    expect(renderHook(() => useMediaQuery("(max-width: 1280px)")).result.current).toBe(false);
  });

  it("re-renders when the viewport crosses the breakpoint", () => {
    const media = stub(false);
    const { result } = renderHook(() => useMediaQuery("(max-width: 1280px)"));
    act(() => media.flip(true));
    expect(result.current).toBe(true);
  });

  it("unsubscribes on unmount, so a closed page listens to nothing", () => {
    const media = stub(false);
    const { unmount } = renderHook(() => useMediaQuery("(max-width: 1280px)"));
    expect(media.subscribers).toBe(1);
    unmount();
    expect(media.subscribers).toBe(0);
  });

  it("answers false where matchMedia does not exist rather than throwing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useMediaQuery("(max-width: 1280px)")).result.current).toBe(false);
  });
});
