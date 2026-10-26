import { describe, expect, it } from "vitest";
import { PLAN_TOUR, PLAN_TOUR_STEPS, ZONE_CARD_TOUR, ZONE_CARD_TOUR_STEPS } from "./zones-tour-steps";

describe("the plan editor tour's steps", () => {
  it("walks the editor in the order a person meets it", () => {
    expect(PLAN_TOUR_STEPS.map((s) => s.id)).toEqual([
      "document-align",
      "plan-sheet",
      "plan-add-pair",
      "plan-save",
      "zone-form",
      "zones-section",
    ]);
  });

  it("keeps every id unique and gives every step words", () => {
    const ids = PLAN_TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of PLAN_TOUR_STEPS) {
      expect(step.title.trim(), step.id).not.toBe("");
      expect(step.body.trim(), step.id).not.toBe("");
    }
  });

  // Every panel step names the View tab, so the overlay scrolls its anchor into view; the window is no panel.
  it("names the view tab for every panel step, and none for the plan window", () => {
    for (const step of PLAN_TOUR_STEPS) {
      if (step.id === "plan-sheet") expect(step.tab, step.id).toBeUndefined();
      else expect(step.tab, step.id).toBe("view");
    }
  });

  it("says what the pair flow and the scale check do", () => {
    const body = (id: string) => PLAN_TOUR_STEPS.find((s) => s.id === id)!.body;
    expect(body("plan-add-pair")).toMatch(/same spot on the model/i);
    expect(body("plan-add-pair")).toMatch(/see-through/i);
    expect(body("plan-add-pair")).toMatch(/drag/i);
    expect(body("plan-save")).toMatch(/own scale/i);
    expect(body("zone-form")).toMatch(/1.5 tags/);
  });

  it("has no centred step: every anchor is on screen when the editor opens", () => {
    expect(PLAN_TOUR_STEPS.some((s) => s.center)).toBe(false);
  });

  it("pins the tour id literally", () => {
    expect(PLAN_TOUR).toBe("plan-editor");
  });
});

describe("the zone card tour's steps", () => {
  it("walks the card from what it says to the library", () => {
    expect(ZONE_CARD_TOUR_STEPS.map((s) => s.id)).toEqual([
      "zone-card",
      "zone-equipment",
      "zone-place",
      "zone-library",
    ]);
  });

  it("keeps every id unique and worded, all on the view tab", () => {
    const ids = ZONE_CARD_TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of ZONE_CARD_TOUR_STEPS) {
      expect(step.title.trim(), step.id).not.toBe("");
      expect(step.body.trim(), step.id).not.toBe("");
      expect(step.tab, step.id).toBe("view");
      expect(step.center, step.id).toBeUndefined();
    }
  });

  it("pins the tour id literally", () => {
    expect(ZONE_CARD_TOUR).toBe("zone-card");
  });

  // Each persisted id is its own flag, so the three new ones must differ from the old two and from each other.
  it("uses ids no other tour uses", () => {
    expect(new Set([PLAN_TOUR, ZONE_CARD_TOUR, "viewer", "panorama"]).size).toBe(4);
  });
});
