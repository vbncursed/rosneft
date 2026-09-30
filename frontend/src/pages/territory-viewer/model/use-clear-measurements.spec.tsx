import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Chain } from "@/entities/measurement";
import { useClearMeasurements, type ClearMeasurementsDeps } from "./use-clear-measurements";

const SAVED: Chain = { id: 1, points: [], closed: false, serverId: 7, sync: "saved" };
const LOCAL: Chain = { id: 2, points: [], closed: false, sync: "local" };

const mount = (over: { chains?: Chain[]; canDeleteMeasurements?: boolean } = {}) => {
  const clear = vi.fn();
  const deps: ClearMeasurementsDeps = {
    chains: over.chains ?? [],
    clear,
    canDeleteMeasurements: over.canDeleteMeasurements ?? true,
  };
  return { clear, ...renderHook(() => useClearMeasurements(deps)) };
};

describe("useClearMeasurements", () => {
  it("asks first when saved chains would go, and clears everything once confirmed", () => {
    const { result, clear } = mount({ chains: [SAVED, LOCAL] });
    act(() => result.current.onClearMeasurements());
    expect(result.current.confirmClear).toBe(true);
    expect(clear).not.toHaveBeenCalled();
    act(() => result.current.onConfirmClear());
    expect(result.current.confirmClear).toBe(false);
    expect(clear).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("clears nothing when the question is cancelled", () => {
    const { result, clear } = mount({ chains: [SAVED] });
    act(() => result.current.onClearMeasurements());
    act(() => result.current.onCancelClear());
    expect(result.current.confirmClear).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears at once when nothing saved is on screen", () => {
    const { result, clear } = mount({ chains: [LOCAL] });
    act(() => result.current.onClearMeasurements());
    expect(result.current.confirmClear).toBe(false);
    expect(clear).toHaveBeenCalledExactlyOnceWith(false);
  });

  // Review r-2: without measurement:delete the saved chains must stay on
  // screen, since nothing will delete them on the server.
  it("keeps the saved chains for a reader who cannot delete them, and asks nothing", () => {
    const { result, clear } = mount({ chains: [SAVED, LOCAL], canDeleteMeasurements: false });
    act(() => result.current.onClearMeasurements());
    expect(result.current.confirmClear).toBe(false);
    expect(clear).toHaveBeenCalledExactlyOnceWith(true);
  });
});
