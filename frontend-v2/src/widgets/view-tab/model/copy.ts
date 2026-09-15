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
