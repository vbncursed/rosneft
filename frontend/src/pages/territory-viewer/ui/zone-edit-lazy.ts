import { lazy } from "react";

const load = () => import("@/features/zone-editor").then((m) => ({ default: m.ZoneEditForm }));

/** Code-split: the editor's barrel carries pdf.js, so the edit form loads when Edit is first pressed, not with the page. */
export const ZoneEditFormLazy = lazy(load);

export const preloadZoneEdit = load;
