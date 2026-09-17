// The transitions themselves are covered in measurement-reducer.spec.ts; this
// suite covers what the hook adds on top — the derived close marker and the
// stability of the dispatchers.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CLOSE_TOLERANCE } from "@/entities/measurement";
import { useMeasurementTool } from "./use-measurement-tool";

const p = (x: number, y = 0, z = 0) => ({ x, y, z });

describe("useMeasurementTool", () => {
  it("starts out of measure mode with nothing drawn", () => {
    const { result } = renderHook(() => useMeasurementTool());
    expect(result.current.measureMode).toBe(false);
    expect(result.current.chains).toEqual([]);
    expect(result.current.activeChainId).toBe(null);
    expect(result.current.activeChainStart).toBe(null);
  });

  it("clicking starts a chain and makes it active", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.click(p(1)));
    expect(result.current.chains.length).toBe(1);
    expect(result.current.activeChainId).toBe(1);
  });

  it("the close marker stays hidden until a second point exists", () => {
    // With one point there is nothing to close into, so showing the marker
    // would invite a click that only appends.
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.click(p(0)));
    expect(result.current.activeChainStart).toBe(null);
    act(() => result.current.click(p(1)));
    expect(result.current.activeChainStart).toEqual(p(0));
  });

  it("the close marker sits on the chain's first point, not its tip", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.click(p(5, 5, 5)));
    act(() => result.current.click(p(1)));
    act(() => result.current.click(p(2)));
    expect(result.current.activeChainStart).toEqual(p(5, 5, 5));
  });

  it("closing a chain clears the marker", () => {
    const { result } = renderHook(() => useMeasurementTool());
    for (const pt of [p(0), p(1), p(0.5, 1)]) act(() => result.current.click(pt));
    act(() => result.current.click(p(CLOSE_TOLERANCE / 2)));
    expect(result.current.activeChainId).toBe(null);
    expect(result.current.activeChainStart).toBe(null);
    expect(result.current.chains[0].closed).toBe(true);
  });

  it("cancelling a chain keeps the points but drops the marker", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.click(p(0)));
    act(() => result.current.click(p(1)));
    act(() => result.current.cancelChain());
    expect(result.current.activeChainStart).toBe(null);
    expect(result.current.chains[0].points.length).toBe(2);
  });

  it("toggle flips measure mode, exit always leaves it", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.toggle());
    expect(result.current.measureMode).toBe(true);
    act(() => result.current.exit());
    expect(result.current.measureMode).toBe(false);
  });

  it("clear wipes the chains", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.click(p(0)));
    act(() => result.current.click(p(1)));
    act(() => result.current.clear(false));
    expect(result.current.chains).toEqual([]);
  });

  it("clear(true) keeps the saved chains", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.seed([{ serverId: 7, points: [p(0), p(1)], closed: false }]));
    act(() => result.current.click(p(5)));
    act(() => result.current.clear(true));
    expect(result.current.chains.map((c) => c.serverId)).toEqual([7]);
  });

  it("removeChain drops the named chain", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.click(p(0)));
    act(() => result.current.removeChain(1));
    expect(result.current.chains).toEqual([]);
  });

  it("removeSegment splits a chain in place", () => {
    const { result } = renderHook(() => useMeasurementTool());
    for (const pt of [p(0), p(1), p(2), p(3)]) act(() => result.current.click(pt));
    act(() => result.current.removeSegment(1, 1));
    expect(result.current.chains.length).toBe(2);
  });

  it("seed draws the stored chains as saved", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.seed([{ serverId: 7, points: [p(0), p(1)], closed: false }]));
    expect(result.current.chains).toEqual([
      { id: 1, serverId: 7, points: [p(0), p(1)], closed: false, sync: "saved" },
    ]);
  });

  it("saving, saved and failed move a chain along", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.click(p(0)));
    act(() => result.current.click(p(1)));
    act(() => result.current.cancelChain());
    act(() => result.current.saving(1));
    expect(result.current.chains[0].sync).toBe("saving");
    act(() => result.current.failed(1));
    expect(result.current.chains[0].sync).toBe("failed");
    act(() => result.current.saved(1, 9));
    expect(result.current.chains[0]).toMatchObject({ sync: "saved", serverId: 9 });
  });

  it("restore puts a removed chain back", () => {
    const { result } = renderHook(() => useMeasurementTool());
    act(() => result.current.seed([{ serverId: 7, points: [p(0), p(1)], closed: false }]));
    const chain = result.current.chains[0];
    act(() => result.current.removeChain(1));
    act(() => result.current.restore(chain));
    expect(result.current.chains).toEqual([chain]);
  });

  it("every dispatcher keeps a stable identity across renders", () => {
    // They are handed to memoized three.js children; a fresh identity per
    // render would re-render the whole measurement layer on every state change.
    const { result, rerender } = renderHook(() => useMeasurementTool());
    const before = { ...result.current };
    act(() => result.current.click(p(0)));
    rerender();
    for (const key of [
      "click",
      "closeActive",
      "cancelChain",
      "toggle",
      "exit",
      "clear",
      "removeChain",
      "removeSegment",
      "seed",
      "saving",
      "saved",
      "failed",
      "restore",
    ] as const) {
      expect(result.current[key], `${key} changed identity`).toBe(before[key]);
    }
  });

  it("the close marker is recomputed only when the active chain changes", () => {
    const { result, rerender } = renderHook(() => useMeasurementTool());
    act(() => result.current.click(p(0)));
    act(() => result.current.click(p(1)));
    const marker = result.current.activeChainStart;
    rerender();
    expect(result.current.activeChainStart, "memo returned a new object").toBe(marker);
  });
});
