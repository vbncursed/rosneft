import { lazy } from "react";

export type { LodReport, ModelCanvasProps, PlanLayer, SiteProps, ViewerCanvasProps } from "./ui/props";
export type { Ground } from "./three/ground-probe";
export type { PlanFit } from "./three/plan-overlay";

/** The default panorama texture decoder: the page hands it to usePanoramaTexture. */
export { decodeImageBitmap } from "./three/image-bitmap";

const load = () => import("./ui/viewer-canvas").then((m) => ({ default: m.ViewerCanvas }));

/** Code-split: three and its loaders stay out of every other page's bundle. */
export const ViewerCanvas = lazy(load);

/** Warm the chunk from a catalog card before the click. */
export const preloadViewer = load;

const loadModel = () => import("./ui/model-canvas").then((m) => ({ default: m.ModelCanvas }));

/** Code-split like ViewerCanvas: the model page pulls three only when it draws a model. */
export const ModelCanvas = lazy(loadModel);

/** Warm the model viewer's chunk (fixtures.spec loads it up front). */
export const preloadModelViewer = loadModel;
