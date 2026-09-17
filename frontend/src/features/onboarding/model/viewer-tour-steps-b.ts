import type { TourStep } from "./tour-step";

// The seven steps package B adds to the viewer tour, spliced between
// `overlays-tabs` and `add-object` in `viewer-tour-steps.ts`. Split into its
// own file — with its own spec — because the full fifteen-step list would
// push `viewer-tour-steps.ts` past the 200-line cap.
//
// `panorama-marker` names no tab: its target is the beacon drawn on the 3D
// model itself, not a control inside the Overlays panel.
export const VIEWER_TOUR_STEPS_B: TourStep[] = [
  {
    id: "panorama-picker",
    tab: "view",
    title: "Switch what you are looking at",
    body: "Jump into a panorama, open a document, or come back to the 3D scene.",
  },
  {
    id: "toggle-markers",
    tab: "view",
    title: "Panorama points",
    body: "Hide the panorama markers when they get in the way of the model. Press P to step through the panoramas.",
  },
  {
    id: "panorama-marker",
    title: "Step inside a panorama",
    body: "Each beacon on the model is a photo taken from that spot. Click one to stand there and look around.",
  },
  {
    id: "move-points",
    tab: "view",
    title: "Move panorama points",
    body: "Turn this on, then drag a marker across the model to re-anchor its panorama. Press V to toggle it.",
  },
  {
    id: "external-link",
    tab: "view",
    title: "External tour",
    body: "Link a panorama tour hosted elsewhere. Visitors open it in a new tab.",
  },
  {
    id: "add-panorama",
    tab: "view",
    title: "Add a panorama",
    body: "Upload an equirectangular image and anchor it to a point on the model.",
  },
  {
    id: "add-document",
    tab: "view",
    title: "Add a document",
    body: "Upload a PDF. It opens in a floating window over the scene, so you can place objects against it.",
  },
];
