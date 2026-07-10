import type { TourStep } from "./tour-step";

// The first-run tour for the territory viewer, in visiting order.
//
// Steps whose target is absent are skipped at runtime, which covers all three
// reasons a control may not render: the user lacks the permission, the
// territory has no panoramas or documents, or the control only appears after a
// selection. So this list is the superset — it never needs a permission check.
//
// Clear, the gizmo mode toggle and the snap toggle get no step of their own:
// none of them can exist on a first run, since nothing is measured or selected
// yet. The Measure and Objects steps describe them instead.
export const VIEWER_TOUR_STEPS: TourStep[] = [
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
    body: "Everything you can add to the scene lives here. View holds panoramas and documents; Objects holds the models placed on the territory.",
  },
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
    id: "user-menu",
    title: "Your account",
    body: "Manage your password and sign-in methods, or log out.",
  },
  {
    id: "shortcuts",
    center: true,
    title: "Keyboard shortcuts",
    body: "M measure · P next panorama · V move panorama points · T move · R rotate · S scale · G snap to surface · Esc step back out. Reopen this tour any time with the ? button.",
  },
];
