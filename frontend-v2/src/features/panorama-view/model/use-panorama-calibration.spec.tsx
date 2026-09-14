import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Panorama } from "@/entities/panorama";
import { usePanoramaCalibration } from "./use-panorama-calibration";

const panorama = (id: number, over: Partial<Panorama> = {}): Panorama => ({
  id,
  territorySlug: "t",
  slug: `p${id}`,
  title: `Point ${id}`,
  sourceBlobHash: `h${id}`,
  position: { x: 1, y: 2, z: 3 },
  yawOffset: 0.25,
  defaultYaw: 0,
  updatedAt: "t0",
  ...over,
});

const setup = (editing: Panorama | null) => {
  const onSave = vi.fn();
  const hook = renderHook(({ row }) => usePanoramaCalibration(row, onSave), {
    initialProps: { row: editing },
  });
  return { ...hook, onSave };
};

describe("usePanoramaCalibration", () => {
  it("is off until it is started, and starting seeds the draft from the row", () => {
    const { result } = setup(panorama(1));
    expect(result.current.calibrating).toBe(false);
    expect(result.current.effective).toBeNull();
    expect(result.current.opacity).toBe(0.5);

    act(() => result.current.start());
    expect(result.current.calibrating).toBe(true);
    expect(result.current.draft).toMatchObject({ position: { x: 1, y: 2, z: 3 }, yawOffset: 0.25 });
  });

  it("has nothing to start without an edit target", () => {
    const { result } = setup(null);
    act(() => result.current.start());
    expect(result.current.calibrating).toBe(false);
  });

  it("nudges one axis of the draft and leaves the saved row alone", () => {
    const { result } = setup(panorama(1));
    act(() => result.current.start());
    act(() => result.current.nudge("x", 0.02));

    expect(result.current.draft?.position).toEqual({ x: 1.02, y: 2, z: 3 });
    expect(result.current.effective?.position).toEqual({ x: 1.02, y: 2, z: 3 });
    expect(result.current.effective?.yawOffset).toBe(0.25);
  });

  it("takes a yaw and a whole position straight from the scene", () => {
    const { result } = setup(panorama(1));
    act(() => result.current.start());
    act(() => result.current.setYaw(1.5));
    act(() => result.current.setPosition({ x: 9, y: 8, z: 7 }));

    expect(result.current.effective).toMatchObject({
      position: { x: 9, y: 8, z: 7 },
      yawOffset: 1.5,
    });
  });

  it("drops the draft when the edit target changes — calibration is derived", () => {
    const { result, rerender } = setup(panorama(1));
    act(() => result.current.start());
    rerender({ row: panorama(2) });

    expect(result.current.calibrating).toBe(false);
    expect(result.current.draft).toBeNull();
    expect(result.current.effective).toBeNull();
  });

  it("saves the draft once and closes", () => {
    const { result, onSave } = setup(panorama(1));
    act(() => result.current.start());
    act(() => result.current.nudge("y", -1));
    act(() => result.current.save());

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(1, { position: { x: 1, y: 1, z: 3 }, yawOffset: 0.25 });
    expect(result.current.calibrating).toBe(false);
  });

  it("saves nothing when there was no draft", () => {
    const { result, onSave } = setup(panorama(1));
    act(() => result.current.save());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("cancel throws the draft away", () => {
    const { result, onSave } = setup(panorama(1));
    act(() => result.current.start());
    act(() => result.current.cancel());

    expect(result.current.calibrating).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the ghost between visible and opaque", () => {
    const { result } = setup(panorama(1));
    act(() => result.current.setOpacity(0));
    expect(result.current.opacity).toBe(0.15);

    act(() => result.current.setOpacity(4));
    expect(result.current.opacity).toBe(1);

    act(() => result.current.setOpacity(0.4));
    expect(result.current.opacity).toBe(0.4);
  });

  it("ignores a nudge when nothing is being calibrated", () => {
    const { result } = setup(panorama(1));
    act(() => result.current.nudge("z", 0.1));
    expect(result.current.draft).toBeNull();
  });
});
