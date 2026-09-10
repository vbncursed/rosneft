import { lazy } from "react";

export type { LodReport, ViewerCanvasProps } from "./ui/props";

const load = () => import("./ui/viewer-canvas").then((m) => ({ default: m.ViewerCanvas }));

/** Code-split: three and its loaders stay out of every other page's bundle. */
export const ViewerCanvas = lazy(load);

/** Warm the chunk from a catalog card before the click. */
export const preloadViewer = load;
