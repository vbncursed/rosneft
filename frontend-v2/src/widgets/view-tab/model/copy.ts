import { printDegrees } from "./degrees";

export const PANORAMAS_OVERLINE = "Panoramas";
export const DOCUMENTS_OVERLINE = "Documents";

export const documentsCount = (n: number) => `PDF overlays · ${n}`;

export const NOT_CALIBRATED = "not calibrated yet";
export const SHOW_IN = "Show in this panorama";
export const EXIT_PANORAMA = "Exit panorama";

export const CALIBRATION_LINE = "Drag panorama points on the model";
export const EXIT_CALIBRATION = "Exit calibration";

export const UPLOAD_PANORAMA_TITLE = "Upload a panorama";
export const UPLOAD_DOCUMENT_TITLE = "Upload a document";

export const LOADING_FOOTER =
  "Panoramas and documents stay clickable while the target LOD downloads — the coarse mesh is enough to aim the camera.";

export const MARKERS_SWITCH = "Show panorama points";
export const MOVE_POINTS = "Move points";
export const TOUR_LINK = "Panorama tour";

// The mock writes "Two placements fall …", so small counts are words. Past
// nine a digit reads faster than a word, which is the usual line.
const WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const spell = (n: number) => WORDS[n - 1] ?? String(n);

/** How many placements the photo marks — the footer of the panorama view. */
export const insideFooter = (n: number) =>
  n === 1
    ? "One placement falls inside this panorama and is marked on the photo."
    : `${spell(n)} placements fall inside this panorama and are marked on the photo.`;

// The anchor card (mock state 9) and the calibration block under it.
export const EDITING_OVERLINE = "Panorama · editing";
export const TITLE_LABEL = "Title";
export const POSITION_LABEL = "Position";
export const SET_FROM_CAMERA = "Set from camera";
export const YAW_LABEL = "Yaw offset";
export const SET_DEFAULT_VIEW = "Set default view";
export const SAVE_ANCHOR = "Save anchor";
export const DELETE_PANORAMA = "Delete panorama";
export const ENTER_PANORAMA_VIEW = "Enter panorama view";
export const SWITCH_TO_3D = "Switch to 3D view";
export const CALIBRATE = "Calibrate (overlay)";
export const CLOSE_EDITOR = "Close panorama editor";
export const OPACITY_LABEL = "Photo opacity";
export const NUDGE_LABEL = "Anchor nudge";
export const YAW_SHORT = "Yaw";
export const SAVE = "Save";
export const EXIT = "Exit";

export const IMAGE_FAILED =
  "This panorama's image failed to load. Delete it and upload a fresh one.";

/** Which of the territory's panoramas is open — the accent note beside the overline. */
export const anchorCounter = (current: number, total: number) => `${current} of ${total}`;

/** Where a reader first looks when this panorama opens. */
export const defaultLook = (rad: number) => `Default look: ${printDegrees(rad)}`;

/** The confirm question, named after the button that asked it. */
export const deletePanoramaTitle = (title: string) => `Delete panorama ${title}?`;

/** One nudge arrow. The axis is the subject, the direction is what happens. */
export const nudgeLabel = (axis: "x" | "y" | "z", up: boolean) =>
  `${up ? "Increase" : "Decrease"} ${axis.toUpperCase()}`;

/** The ghosted photo's opacity, as the mock prints it. */
export const opacityPercent = (o: number) => `${Math.round(o * 100)} %`;
