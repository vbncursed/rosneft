import { describe, expect, it } from "vitest";
import { VIEWER_TOUR, VIEWER_TOUR_STEPS } from "./viewer-tour-steps";

describe("the viewer tour's steps", () => {
  it("visits all fifteen controls, in order", () => {
    expect(VIEWER_TOUR_STEPS.map((s) => s.id)).toEqual([
      "intro",
      "catalog-link",
      "reset-camera",
      "measure",
      "overlays-tabs",
      "panorama-picker",
      "toggle-markers",
      "panorama-marker",
      "move-points",
      "external-link",
      "add-panorama",
      "add-document",
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

  it("puts every View-tab step on view and every Placements-tab step on placements", () => {
    const VIEW_STEPS = [
      "panorama-picker",
      "toggle-markers",
      "move-points",
      "external-link",
      "add-panorama",
      "add-document",
    ];
    const PLACEMENTS_STEPS = ["add-object", "objects-list"];
    for (const step of VIEWER_TOUR_STEPS) {
      if (VIEW_STEPS.includes(step.id)) expect(step.tab, step.id).toBe("view");
      else if (PLACEMENTS_STEPS.includes(step.id)) expect(step.tab, step.id).toBe("placements");
      else expect(step.tab, step.id).toBeUndefined();
    }
  });

  // A centred step has no anchor to reveal, so pairing it with a tab would
  // switch the panel for nothing.
  it("opens and closes centred, and those two steps name no tab", () => {
    const centred = VIEWER_TOUR_STEPS.filter((s) => s.center);
    expect(centred.map((s) => s.id)).toEqual(["intro", "shortcuts"]);
    for (const step of centred) expect(step.tab).toBeUndefined();
  });

  // The rail's Replay tile draws the help icon, a question mark. A no-break
  // space keeps the "?" off the start of a line, where it reads as punctuation.
  it("points the shortcuts step at the ? button, never wrapping before it", () => {
    const shortcuts = VIEWER_TOUR_STEPS.find((s) => s.id === "shortcuts")!;
    expect(shortcuts.body).toMatch(/with the\u00a0\? button\.$/);
  });

  // The id keys the persisted onboardingToursSeen set: renaming it replays the
  // tour for every user who has already seen it.
  it("pins the tour id literally", () => {
    expect(VIEWER_TOUR).toBe("viewer");
  });
});
