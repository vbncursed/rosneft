import { describe, expect, it } from "vitest";
import { VIEWER_TOUR_STEPS } from "./viewer-tour-steps";
import type { TourStep } from "./tour-step";

// TourStep is a type: it has no runtime behaviour of its own, so the only thing
// left to pin is that the shape the tours are written against is the shape the
// overlay reads.
describe("TourStep", () => {
  it("describes the steps the viewer tour actually ships", () => {
    const steps: TourStep[] = VIEWER_TOUR_STEPS;
    expect(steps[0]).toMatchObject({ id: expect.any(String), title: expect.any(String), body: expect.any(String) });
  });
});
