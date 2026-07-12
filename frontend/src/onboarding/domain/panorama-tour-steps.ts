import type { TourStep } from "./tour-step";

// The second first-run tour: it starts the first time the user stands inside a
// panorama, where a whole panel of controls appears that the viewer tour could
// never point at.
//
// The editing controls (Set from camera, Yaw, Save anchor, Calibrate, Delete)
// are absent for a read-only user, so those steps skip themselves — the same
// rule the viewer tour relies on.
//
// Entering by pressing P only sets the active panorama, not the edit target, so
// the panel may be closed; every panel step then skips and the tour is reduced
// to looking around and getting back out. That is the honest outcome, not a bug.
export const PANORAMA_TOUR_STEPS: TourStep[] = [
  {
    id: "panorama-intro",
    center: true,
    title: "You are inside the panorama",
    body: "The photo is wrapped around you, taken from this exact point on the model. Drag to look around — the camera stays anchored, so you cannot walk away from the spot.",
  },
  {
    id: "panorama-view-toggle",
    tab: "view",
    title: "Get back to the model",
    body: "This returns you to the 3D scene. Esc does not leave a panorama — use this button, or pick 3D scene in the View list.",
  },
  {
    id: "panorama-picker",
    tab: "view",
    title: "Move between panoramas",
    body: "Jump straight to another photo point from here. Pressing P steps through them in order.",
  },
  {
    id: "panorama-set-from-camera",
    tab: "view",
    title: "Where the photo sits",
    body: "The anchor is where this photo lives on the model. This button copies your 3D camera into it — greyed out right now, because inside the panorama the camera is pinned to the anchor itself. Leave to the 3D view, aim, then come back.",
  },
  {
    id: "panorama-yaw",
    tab: "view",
    title: "Turn the photo to match",
    body: "Yaw rotates the photo around you until what you see lines up with the model beneath it.",
  },
  {
    id: "panorama-default-view",
    tab: "view",
    title: "Set the opening view",
    body: "Turn to face what matters, then capture it here — everyone who opens this panorama starts looking this way. Save anchor keeps it.",
  },
  {
    id: "panorama-save-anchor",
    tab: "view",
    title: "Keep the changes",
    body: "Saves the anchor and the yaw. It stays greyed out until you change one of them.",
  },
  {
    id: "panorama-calibrate",
    tab: "view",
    title: "Line it up precisely",
    body: "Calibration fades the model in behind the photo and gives you nudge buttons per axis, so you can match them by eye instead of typing coordinates.",
  },
  {
    id: "panorama-delete",
    tab: "view",
    title: "Remove the panorama",
    body: "Deletes this photo point. Use it when an image failed to load and you need to upload a fresh one.",
  },
];
