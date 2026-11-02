import { lazy } from "react";

const load = () => import("@/features/zone-editor").then((m) => ({ default: m.ZoneEditForm }));

// Code-split: the editor's barrel carries pdf.js, so the form loads on the first Edit details, not with the page.
let form = lazy(load);

/** The lazy form; the same one until `resetZoneEdit`. */
export const zoneEditForm = () => form;

/** A failed chunk stays failed inside its lazy, so a failure swaps in a fresh one for the next try. */
export const resetZoneEdit = () => {
  form = lazy(load);
};

/** Warms the chunk: called when the pointer or focus reaches Edit details, so the click usually finds it loaded. */
export const preloadZoneEdit = load;
