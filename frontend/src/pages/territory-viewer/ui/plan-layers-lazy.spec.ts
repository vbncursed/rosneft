import { describe, expect, it } from "vitest";
import PlanLayers from "./plan-layers";
import { PlanLayersLazy, preloadPlanLayers } from "./plan-layers-lazy";

describe("PlanLayersLazy", () => {
  it("loads the plan layer on demand, as its own module", async () => {
    const loaded = await preloadPlanLayers();
    expect(loaded.default).toBe(PlanLayers);
  });

  it("is a lazy component the page can suspend on", () => {
    expect(PlanLayersLazy.$$typeof).toBe(Symbol.for("react.lazy"));
  });
});
