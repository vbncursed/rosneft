import { describe, expect, it } from "vitest";
import { PANORAMA_TOUR, PANORAMA_TOUR_STEPS } from "./panorama-tour-steps";

describe("the panorama tour's steps", () => {
  it("visits all nine controls, in order", () => {
    expect(PANORAMA_TOUR_STEPS.map((s) => s.id)).toEqual([
      "panorama-intro",
      "panorama-view-toggle",
      "panorama-picker",
      "panorama-set-from-camera",
      "panorama-yaw",
      "panorama-default-view",
      "panorama-save-anchor",
      "panorama-calibrate",
      "panorama-delete",
    ]);
  });

  it("keeps every id unique — data-tour lookups must not collide", () => {
    const ids = PANORAMA_TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every step a title and a body", () => {
    for (const step of PANORAMA_TOUR_STEPS) {
      expect(step.title.trim(), `${step.id} has no title`).not.toBe("");
      expect(step.body.trim(), `${step.id} has no body`).not.toBe("");
    }
  });

  // Every step is on the View tab except the centred intro, which names none.
  it("puts every non-centred step on the view tab", () => {
    for (const step of PANORAMA_TOUR_STEPS) {
      if (step.center) expect(step.tab, step.id).toBeUndefined();
      else expect(step.tab, step.id).toBe("view");
    }
  });

  it("opens centred, and only the intro does", () => {
    const centred = PANORAMA_TOUR_STEPS.filter((s) => s.center);
    expect(centred.map((s) => s.id)).toEqual(["panorama-intro"]);
  });

  // The id keys the persisted onboardingToursSeen set: renaming it replays the
  // tour for every user who has already seen it.
  it("pins the tour id literally", () => {
    expect(PANORAMA_TOUR).toBe("panorama");
  });
});
