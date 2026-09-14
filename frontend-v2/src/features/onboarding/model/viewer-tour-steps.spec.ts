import { describe, expect, it } from "vitest";
import { VIEWER_TOUR, VIEWER_TOUR_STEPS } from "./viewer-tour-steps";

describe("the viewer tour's steps", () => {
  it("visits the eight controls the A scope ships, in order", () => {
    expect(VIEWER_TOUR_STEPS.map((s) => s.id)).toEqual([
      "intro",
      "catalog-link",
      "reset-camera",
      "measure",
      "overlays-tabs",
      "add-object",
      "objects-list",
      "shortcuts",
    ]);
  });

  // A duplicate id makes `[data-tour="<id>"]` ambiguous, so the overlay would
  // spotlight whichever element comes first in the document.
  it("keeps every id unique — data-tour lookups must not collide", () => {
    const ids = VIEWER_TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every step a title and a body", () => {
    for (const step of VIEWER_TOUR_STEPS) {
      expect(step.title.trim(), `${step.id} has no title`).not.toBe("");
      expect(step.body.trim(), `${step.id} has no body`).not.toBe("");
    }
  });

  it("names only the two tabs the overlays panel renders", () => {
    const tabs = VIEWER_TOUR_STEPS.flatMap((s) => (s.tab ? [s.tab] : []));
    expect(tabs).toEqual(["placements", "placements"]);
  });

  // A centred step has no anchor to reveal, so pairing it with a tab would
  // switch the panel for nothing.
  it("opens and closes centred, and those two steps name no tab", () => {
    const centred = VIEWER_TOUR_STEPS.filter((s) => s.center);
    expect(centred.map((s) => s.id)).toEqual(["intro", "shortcuts"]);
    for (const step of centred) expect(step.tab).toBeUndefined();
  });

  // The B steps were dropped, not merely unlinked: a body still promising a
  // panorama or a PDF sends the reader looking for a control that is not there.
  it("promises nothing the A viewer does not have", () => {
    for (const step of VIEWER_TOUR_STEPS) {
      expect(step.body, `${step.id} mentions a panorama`).not.toMatch(/panorama/i);
      expect(step.body, `${step.id} mentions a document`).not.toMatch(/document|PDF/i);
    }
  });

  // The id keys the persisted onboardingToursSeen set: renaming it replays the
  // tour for every user who has already seen it.
  it("pins the tour id literally", () => {
    expect(VIEWER_TOUR).toBe("viewer");
  });
});
