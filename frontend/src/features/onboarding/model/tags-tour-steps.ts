import type { TourStep } from "./tour-step";

// Persisted per user like every tour id; see `viewer-tour-steps.ts`.
export const TAGS_TOUR = "content-tags";

// The Content page's Tags card, for anyone who can manage models. The card is
// the only thing on the page without a step of its own elsewhere, so the tour
// is two stops: what tags are for, then how to add one.
export const TAGS_TOUR_STEPS: TourStep[] = [
  {
    id: "content-tags",
    reveal: true,
    title: "Model tags",
    body: "Tags group models, and a zone offers the models that carry its tags. Rename a tag in its row. ungrouped is read-only, and a tag cannot be deleted.",
  },
  {
    id: "content-tag-add",
    reveal: true,
    title: "Add a tag",
    body: "Give the new tag a slug and a title. The slug takes lowercase letters, digits and single hyphens, and a rename changes only the title.",
  },
];
