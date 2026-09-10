import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LodArtifact } from "@/entities/scene";
import { useProgressiveLod } from "./use-progressive-lod";

const chain: LodArtifact[] = [
  { lod: 0, hash: "a", size: 3 },
  { lod: 1, hash: "b", size: 2 },
  { lod: 2, hash: "c", size: 1 },
];

describe("useProgressiveLod", () => {
  it("shows the coarsest level first and warms the target", () => {
    const { result } = renderHook(() => useProgressiveLod(chain, 0));
    expect(result.current.shown?.lod).toBe(2);
    expect(result.current.url).toContain("/api/assets/c");
    expect(result.current.warmUrl).toContain("/api/assets/a");
  });

  it("swaps to the target once the warmer reports it loaded", () => {
    const { result } = renderHook(() => useProgressiveLod(chain, 0));
    act(() => result.current.onWarmReady());
    expect(result.current.url).toContain("/api/assets/a");
    expect(result.current.warmUrl).toBeNull();
  });

  it("a chain change resets readiness", () => {
    const { result, rerender } = renderHook(({ c }) => useProgressiveLod(c, 0), {
      initialProps: { c: chain },
    });
    act(() => result.current.onWarmReady());
    expect(result.current.shown?.lod).toBe(0);
    rerender({ c: [{ lod: 0, hash: "x", size: 3 }, { lod: 2, hash: "z", size: 1 }] });
    expect(result.current.shown?.hash).toBe("z");
    expect(result.current.warmUrl).toContain("/api/assets/x");
  });

  it("a single-level chain warms nothing", () => {
    const { result } = renderHook(() => useProgressiveLod([chain[0]], 0));
    expect(result.current.url).toContain("/api/assets/a");
    expect(result.current.warmUrl).toBeNull();
  });

  it("a warm failure drops that level and re-targets the next best", () => {
    const { result } = renderHook(() => useProgressiveLod(chain, 0));
    act(() => result.current.onWarmFailed());
    expect(result.current.target?.lod).toBe(1);
    expect(result.current.shown?.lod).toBe(2);
  });

  it("a shown failure stands until retry, and hides the scene meanwhile", () => {
    const { result } = renderHook(() => useProgressiveLod([chain[2]], 2));
    act(() => result.current.onShownFailed({ status: 502 }));
    expect(result.current.url).toBeNull();
    expect(result.current.failure).toEqual({ hash: "c", status: 502 });
    act(() => result.current.retry());
    expect(result.current.url).toContain("/api/assets/c");
  });

  it("a shown drop re-targets to the next best level and leaves failure null", () => {
    const { result } = renderHook(() => useProgressiveLod(chain, 0));
    act(() => result.current.onShownDropped());
    expect(result.current.shown?.lod).toBe(1);
    expect(result.current.failure).toBeNull();
  });

  it("a manual target change mid-download re-keys readiness", () => {
    const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), {
      initialProps: { t: 0 },
    });
    act(() => result.current.onWarmReady());
    expect(result.current.shown?.lod).toBe(0);
    rerender({ t: 1 });
    expect(result.current.shown?.lod).toBe(2);
    expect(result.current.warmUrl).toContain("/api/assets/b");
  });

  it("resolves urls through urlOf", () => {
    const { result } = renderHook(() => useProgressiveLod(chain, 0, (a) => `blob:${a.hash}`));
    expect(result.current.url).toBe("blob:c");
  });

  it("an empty chain renders nothing and warms nothing", () => {
    const { result } = renderHook(() => useProgressiveLod([], 0));
    expect(result.current.url).toBeNull();
    expect(result.current.warmUrl).toBeNull();
    expect(result.current.target).toBeNull();
  });
});
