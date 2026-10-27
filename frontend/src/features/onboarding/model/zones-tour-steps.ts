import type { TourStep } from "./tour-step";

// Tour ids are persisted per user (`onboardingToursSeen`), so they are part of
// the stored data — renaming one replays that tour for everyone who saw it.
// The backend validates only their shape, never this list.
export const PLAN_TOUR = "plan-editor";
export const ZONE_CARD_TOUR = "zone-card";

// Two tours rather than one `zones` tour, because there are two first contacts
// with the feature and a single flag would let the first one spend the other:
// an editor (`zone:write`) meets the plan window, a reader meets a zone's card.
//
// This one starts the first time the plan editor opens. The editing controls
// exist only for `zone:write`, which is also the only grant that opens the
// editor, so nothing here needs a permission check; a step whose anchor is
// absent skips itself like everywhere else. Every step inside the Overlays
// panel names the View tab, which is also what makes the overlay scroll its
// anchor into view: the align card and a zone's card sit above the tabs, in a
// panel that is usually scrolled to wherever the reader left it.
export const PLAN_TOUR_STEPS: TourStep[] = [
  {
    id: "document-align",
    tab: "view",
    title: "Where the plan lives",
    body: "Documents lists this territory's PDFs. Align plan on a row opens the plan editor; once a plan is aligned, the same button reads Edit zones.",
  },
  {
    id: "plan-sheet",
    title: "The plan window",
    body: "The PDF is drawn here. Drag to pan, scroll to zoom, and use the buttons at the bottom left to zoom or fit the page. Outlined rectangles are shapes found on the plan, and saved zones are filled.",
  },
  {
    id: "plan-add-pair",
    tab: "view",
    title: "Pair the plan with the model",
    body: "Press Add a point pair, click a spot on the plan, then click the same spot on the model. While a point waits, the plan window is see-through so the model underneath can be clicked. Drag a marker to fine-tune it. Two pairs are the minimum; more spread-out pairs fit better.",
  },
  {
    id: "plan-save",
    tab: "view",
    title: "Check the fit, then save",
    body: "Each pair lists how many metres it is off, and the line below says how well they fit. The scale line compares sizes: a plan aligned by hand is checked against the drawing's own scale, read from its survey labels. Save alignment keeps it for everyone.",
  },
  {
    id: "zone-form",
    tab: "view",
    title: "Make a zone",
    body: "Pick a rectangle on the plan, give it a title and 1–5 tags, then press Create zone. The tags decide which models the zone offers.",
  },
  {
    id: "zones-section",
    tab: "view",
    title: "Show zones",
    body: "Show zones draws every zone over the model as a 3 m high translucent box, so you can see it and click it from any angle. The PDF itself is not drawn in the scene.",
  },
];

// The second: it starts the first time a reader clicks a zone, for anyone who
// can see zones. The place step needs `placement:create` and skips without it.
export const ZONE_CARD_TOUR_STEPS: TourStep[] = [
  {
    id: "zone-card",
    tab: "view",
    title: "A zone",
    body: "Its tags, how its size compares with the drawing, and how many placed objects sit inside. Click empty space or press Esc to let go of it.",
  },
  {
    id: "zone-place",
    tab: "view",
    title: "Add objects to the zone",
    body: "Clicking a zone opens the model list filtered to its tags, so you see what can be placed there. Add objects reopens that list; the objects land at the zone's centre, where you can move them.",
  },
];
