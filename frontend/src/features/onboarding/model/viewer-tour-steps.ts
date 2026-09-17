import type { TourStep } from "./tour-step";
import { VIEWER_TOUR_STEPS_B } from "./viewer-tour-steps-b";

// Tour ids are persisted per user (`onboardingToursSeen`), so they are part of
// the stored data — renaming one replays that tour for everyone who saw it.
// The backend validates only their shape, never this list.
export const VIEWER_TOUR = "viewer";

// The first-run tour for the territory viewer, in visiting order.
//
// Steps whose target is absent are skipped at runtime, which covers every
// reason a control may not render: the user lacks the permission, the
// territory has no panoramas or documents, or the control only appears after
// a selection. So this list is the superset — it never needs a permission
// check.
//
// Clear, the gizmo mode toggle and the snap toggle get no step of their own:
// none of them can exist on a first run, since nothing is measured or
// selected yet. The Measure and Objects steps describe them instead.
//
// The user-menu step is gone — the account link moved out of this shell in an
// earlier task. The package B panorama and document steps
// (`viewer-tour-steps-b.ts`) splice in between `overlays-tabs` and
// `add-object`, split into their own file so this one stays under the
// 200-line cap.
const HEAD: TourStep[] = [
  {
    id: "intro",
    center: true,
    title: "Welcome to the viewer",
    body: "This is the 3D scene for this territory. Take a minute to learn the controls — you can leave at any point with Skip or the Esc key.",
  },
  {
    id: "catalog-link",
    title: "Back to the catalog",
    body: "Return to the list of every territory and model.",
  },
  {
    id: "reset-camera",
    title: "Reset the camera",
    body: "Frame the whole territory again after you have zoomed or panned away. Drag to rotate, scroll to zoom, right-drag to pan.",
  },
  {
    id: "measure",
    title: "Measure distances",
    body: "Click two points on any surface to measure between them. Keep clicking to chain segments, and click the first dot to close the loop. A Clear button appears once you have drawn something.",
  },
  {
    id: "overlays-tabs",
    title: "Overlays",
    body: "Everything you can add to the scene lives here. View holds panoramas and documents; Placements holds the models placed on it.",
  },
];

const TAIL: TourStep[] = [
  {
    id: "add-object",
    tab: "placements",
    title: "Place an object",
    body: "Pick a model and drop it onto the territory.",
  },
  {
    id: "objects-list",
    tab: "placements",
    title: "Your objects",
    body: "Click an object to select it, here or in the scene. A selected object gets a gizmo — press T to move, R to rotate, S to scale, and G to snap it to the surface.",
  },
  {
    id: "shortcuts",
    center: true,
    title: "Keyboard shortcuts",
    body: "M measure · P next panorama · V move panorama points · T move · R rotate · S scale · G snap to surface · Esc step back out. Reopen this tour any time with the ▶ button.",
  },
];

export const VIEWER_TOUR_STEPS: TourStep[] = [...HEAD, ...VIEWER_TOUR_STEPS_B, ...TAIL];
