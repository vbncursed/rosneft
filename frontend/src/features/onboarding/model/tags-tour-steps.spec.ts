import { describe, expect, it } from "vitest";
import { TAGS_TOUR, TAGS_TOUR_STEPS } from "./tags-tour-steps";

describe("the model tags tour's steps", () => {
  it("explains the card, then the add form", () => {
    expect(TAGS_TOUR_STEPS.map((s) => s.id)).toEqual(["content-tags", "content-tag-add"]);
  });

  it("says ungrouped is read-only and nothing is deleted", () => {
    const card = TAGS_TOUR_STEPS[0].body;
    expect(card).toMatch(/ungrouped/);
    expect(card).toMatch(/read-only/);
    expect(card).toMatch(/cannot be deleted/);
  });

  it("is worded, untabbed and uncentred", () => {
    for (const step of TAGS_TOUR_STEPS) {
      expect(step.title.trim(), step.id).not.toBe("");
      expect(step.body.trim(), step.id).not.toBe("");
      expect(step.tab).toBeUndefined();
      expect(step.center).toBeUndefined();
    }
  });

  // The card sits at the foot of the page, below the fold on a long catalog.
  it("asks the overlay to scroll each anchor into view", () => {
    expect(TAGS_TOUR_STEPS.every((s) => s.reveal === true)).toBe(true);
  });

  it("pins the tour id literally", () => {
    expect(TAGS_TOUR).toBe("content-tags");
  });
});
