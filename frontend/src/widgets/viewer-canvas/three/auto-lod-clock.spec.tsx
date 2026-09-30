import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTLE_MS, useAutoLodBus, type Measure } from "./settle-bus";
import { fakeControls, WithControls } from "./testing";

// What useAutoLod does with the clock, and nothing else.
function Watcher({ measure }: { measure: Measure }) {
  const bus = useAutoLodBus();
  useEffect(() => bus.watch(measure), [bus, measure]);
  return null;
}

const advance = (ms: number) => ReactThreeTestRenderer.act(async () => void vi.advanceTimersByTime(ms));

// WithControls is the clock under the controls a CameraRig would publish.
async function mount(measure: Measure) {
  const controls = fakeControls();
  const r = await ReactThreeTestRenderer.create(
    <WithControls controls={controls}>
      <Watcher measure={measure} />
    </WithControls>,
  );
  return { r, controls };
}

describe("AutoLodClock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the view SETTLE_MS after the controls stop moving", async () => {
    const measure = vi.fn(() => true);
    const { r, controls } = await mount(measure);
    await advance(SETTLE_MS);
    expect(measure).toHaveBeenCalledTimes(1);
    controls.fire("change");
    await advance(SETTLE_MS - 1);
    expect(measure).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(measure).toHaveBeenCalledTimes(2);
    await r.unmount();
  });

  it("retries on a rendered frame what had nothing to measure", async () => {
    const measure = vi.fn(() => false);
    const { r } = await mount(measure);
    await advance(SETTLE_MS);
    expect(measure).toHaveBeenCalledTimes(1);
    await ReactThreeTestRenderer.act(async () => r.advanceFrames(1, 0));
    expect(measure).toHaveBeenCalledTimes(2);
    await r.unmount();
  });

  it("lets go of the controls and of a pending settle on unmount", async () => {
    const measure = vi.fn(() => true);
    const { r, controls } = await mount(measure);
    controls.fire("change");
    await r.unmount();
    expect(controls.listeners.get("change")?.size ?? 0).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
