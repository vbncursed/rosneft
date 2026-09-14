import { describe, expect, it } from "vitest";
import { NUDGE_STEPS } from "./nudge-steps";

describe("NUDGE_STEPS", () => {
  it("offers three steps, coarsening left to right", () => {
    expect(NUDGE_STEPS).toEqual([
      { label: "Fine", value: 0.005 },
      { label: "Med", value: 0.02 },
      { label: "Coarse", value: 0.1 },
    ]);
  });
});
