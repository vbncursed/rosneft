import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMeasurementSwitch } from "./use-measurement-switch";

beforeEach(() => localStorage.clear());

describe("useMeasurementSwitch", () => {
  it("shows the ruler until someone hides it", () => {
    expect(renderHook(() => useMeasurementSwitch()).result.current.showMeasurements).toBe(true);
  });

  it("remembers the hidden ruler under andrey.measurements, apart from the panorama points", () => {
    const { result } = renderHook(() => useMeasurementSwitch());
    act(() => result.current.toggle());

    expect(result.current.showMeasurements).toBe(false);
    expect(localStorage.getItem("andrey.measurements")).toBe("hidden");
    expect(localStorage.getItem("andrey.panorama-markers")).toBeNull();
  });

  it("reads a stored hidden choice on mount", () => {
    localStorage.setItem("andrey.measurements", "hidden");
    expect(renderHook(() => useMeasurementSwitch()).result.current.showMeasurements).toBe(false);
  });
});
