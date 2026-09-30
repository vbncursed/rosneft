import { useEffect } from "react";
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

  it("returning to a level already seen goes through the coarse level again (0 → 2 → 0)", () => {
    // Readiness is a fact about the level being fetched *now*. Kept from the
    // first visit, it put LOD 0 straight back on screen on the way back — the
    // canvas then suspended on a url nobody had parsed and drew nothing for the
    // whole download, with no chip and no progress.
    const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), {
      initialProps: { t: 0 },
    });
    act(() => result.current.onWarmReady());
    rerender({ t: 2 });
    expect(result.current.shown?.lod).toBe(2);
    rerender({ t: 0 });
    expect(result.current.shown?.lod).toBe(2);
    expect(result.current.url).toContain("/api/assets/c");
    expect(result.current.warmUrl).toContain("/api/assets/a");
    act(() => result.current.onWarmReady());
    expect(result.current.url).toContain("/api/assets/a");
  });

  // Auto climbs in steps as the reader zooms. Dropping back to the coarsest
  // for the whole download of the next step made zooming in go blurrier.
  it("a finer target keeps the ready level on screen while it warms (2 → 1 → 0)", () => {
    const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), {
      initialProps: { t: 1 },
    });
    expect(result.current.shown?.lod).toBe(2);
    expect(result.current.warmUrl).toContain("/api/assets/b");
    act(() => result.current.onWarmReady());
    expect(result.current.shown?.lod).toBe(1);

    rerender({ t: 0 });
    expect(result.current.shown?.lod).toBe(1);
    expect(result.current.url).toContain("/api/assets/b");
    expect(result.current.warmUrl).toContain("/api/assets/a");
    act(() => result.current.onWarmReady());
    expect(result.current.shown?.lod).toBe(0);
    expect(result.current.warmUrl).toBeNull();
  });

  it("a finer target before the previous one was ready still shows the coarsest", () => {
    const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), {
      initialProps: { t: 1 },
    });
    rerender({ t: 0 });
    expect(result.current.shown?.lod).toBe(2);
    expect(result.current.warmUrl).toContain("/api/assets/a");
  });

  it("a held level that is dropped falls back to the coarsest", () => {
    const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), {
      initialProps: { t: 1 },
    });
    act(() => result.current.onWarmReady());
    rerender({ t: 0 });
    expect(result.current.shown?.lod).toBe(1);
    act(() => result.current.onShownDropped());
    expect(result.current.shown?.lod).toBe(2);
    expect(result.current.warmUrl).toContain("/api/assets/a");
  });

  // Nothing would ever warm LOD 1 again (the territory warms only its blob
  // download, which a refusal never mints), so the coarsest stayed for good.
  it("a refused finer level keeps the held level on screen", () => {
    const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), {
      initialProps: { t: 1 },
    });
    act(() => result.current.onWarmReady());
    rerender({ t: 0 });
    act(() => result.current.onWarmFailed());
    expect(result.current.target?.lod).toBe(1);
    expect(result.current.shown?.lod).toBe(1);
    expect(result.current.url).toContain("/api/assets/b");
    expect(result.current.warmUrl).toBeNull();
  });

  // A manual 1 → 0 → 1 before LOD 0 was ready read as a coarser move: LOD 2
  // came back and LOD 1 warmed again, though it never left the screen.
  it("a return to the held level keeps it on screen, ready (1 → 0 → 1)", () => {
    const shows: (number | undefined)[] = [];
    const { result, rerender } = renderHook(
      ({ t }) => {
        const lod = useProgressiveLod(chain, t);
        // Committed renders only: a render adjusted by a setState in render
        // is thrown away before it reaches the screen.
        useEffect(() => {
          shows.push(lod.shown?.lod);
        });
        return lod;
      },
      { initialProps: { t: 1 } },
    );
    act(() => result.current.onWarmReady());
    const from = shows.length;
    rerender({ t: 0 });
    rerender({ t: 1 });
    expect(shows.slice(from)).not.toContain(2);
    expect(result.current.shown?.lod).toBe(1);
    expect(result.current.url).toContain("/api/assets/b");
    expect(result.current.warmUrl).toBeNull();
    // Ready, not merely shown: a finer move holds it again.
    rerender({ t: 0 });
    expect(result.current.shown?.lod).toBe(1);
  });

  // Once LOD 0 is ready the hold is over: LOD 1 is off screen, and in the
  // territory its blob is released. A stale hold called it ready on the way
  // back, and the canvas suspended on a url nobody had parsed.
  it("a return to a level whose hold ended with the finer one ready goes through the coarsest (1 → 0 → 1)", () => {
    const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), {
      initialProps: { t: 1 },
    });
    act(() => result.current.onWarmReady());
    rerender({ t: 0 });
    act(() => result.current.onWarmReady());
    expect(result.current.shown?.lod).toBe(0);
    rerender({ t: 1 });
    expect(result.current.shown?.lod).toBe(2);
    expect(result.current.warmUrl).toContain("/api/assets/b");
  });

  it("retry clears the hold", () => {
    const { result, rerender } = renderHook(({ t }) => useProgressiveLod(chain, t), {
      initialProps: { t: 1 },
    });
    act(() => result.current.onWarmReady());
    rerender({ t: 0 });
    expect(result.current.shown?.lod).toBe(1);
    act(() => result.current.retry());
    expect(result.current.shown?.lod).toBe(2);
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
