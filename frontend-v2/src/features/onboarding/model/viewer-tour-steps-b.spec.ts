import { describe, expect, it } from "vitest";
import { VIEWER_TOUR_STEPS_B } from "./viewer-tour-steps-b";

describe("the viewer tour's package-B steps", () => {
  it("visits the seven panorama and document controls, in order", () => {
    expect(VIEWER_TOUR_STEPS_B.map((s) => s.id)).toEqual([
      "panorama-picker",
      "toggle-markers",
      "panorama-marker",
      "move-points",
      "external-link",
      "add-panorama",
      "add-document",
    ]);
  });

  it("keeps every id unique", () => {
    const ids = VIEWER_TOUR_STEPS_B.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every step a title and a body", () => {
    for (const step of VIEWER_TOUR_STEPS_B) {
      expect(step.title.trim(), `${step.id} has no title`).not.toBe("");
      expect(step.body.trim(), `${step.id} has no body`).not.toBe("");
    }
  });

  // panorama-marker targets a beacon drawn on the 3D model, not a panel
  // control, so it names no tab; every other step is on the View tab.
  it("puts every step but panorama-marker on the view tab", () => {
    for (const step of VIEWER_TOUR_STEPS_B) {
      if (step.id === "panorama-marker") expect(step.tab).toBeUndefined();
      else expect(step.tab, step.id).toBe("view");
    }
  });

  it("centres none of them — every anchor exists in the DOM already", () => {
    expect(VIEWER_TOUR_STEPS_B.every((s) => !s.center)).toBe(true);
  });
});
