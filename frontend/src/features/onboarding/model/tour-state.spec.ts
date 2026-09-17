import { describe, expect, it } from "vitest";
import { IDLE, current, next, prev, skip, start } from "./tour-state";
import type { TourStep } from "./tour-step";

const steps: TourStep[] = [
  { id: "a", title: "A", body: "a" },
  { id: "b", title: "B", body: "b" },
];

describe("tour state", () => {
  it("never activates with no steps", () => {
    expect(start([])).toEqual(IDLE);
    expect(current(start([]))).toBeNull();
  });

  it("starts on the first step", () => {
    const state = start(steps);
    expect(state.active).toBe(true);
    expect(state.index).toBe(0);
    expect(current(state)?.id).toBe("a");
  });

  it("walks forward one step at a time", () => {
    expect(current(next(start(steps)))?.id).toBe("b");
  });

  it("finishes the tour when next passes the last step", () => {
    const done = next(next(start(steps)));
    expect(done.active).toBe(false);
    expect(current(done)).toBeNull();
  });

  it("clamps prev at the first step rather than deactivating", () => {
    const state = prev(start(steps));
    expect(state.active).toBe(true);
    expect(state.index).toBe(0);
  });

  it("walks back to the previous step", () => {
    expect(current(prev(next(start(steps))))?.id).toBe("a");
  });

  it("skips from any step", () => {
    expect(skip(start(steps)).active).toBe(false);
    expect(skip(next(start(steps))).active).toBe(false);
  });

  // The overlay calls next() blindly when a target is missing; a run of missing
  // targets must drain to inactive rather than throw or wrap around.
  it("treats every transition on an inactive state as a no-op", () => {
    expect(next(IDLE)).toEqual(IDLE);
    expect(prev(IDLE)).toEqual(IDLE);
    expect(skip(IDLE)).toEqual(IDLE);
    expect(current(IDLE)).toBeNull();

    const done = skip(start(steps));
    expect(next(done)).toEqual(done);
    expect(prev(done)).toEqual(done);
  });
});
