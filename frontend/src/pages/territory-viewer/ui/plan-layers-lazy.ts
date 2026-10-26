import { lazy } from "react";

const load = () => import("./plan-layers");

/** Code-split: the PDF reader and the alignment editor load when a plan is first aligned or shown. */
export const PlanLayersLazy = lazy(load);

/** Warm the chunk (fixtures.spec loads it up front). */
export const preloadPlanLayers = load;
