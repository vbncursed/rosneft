import { describe, expectTypeOf, it } from "vitest";
import type { ViewerCanvasProps } from "@/widgets/viewer-canvas";
import type { PlacementsPanelProps } from "@/widgets/placements-panel";
import type { PlaceObjectsModalProps } from "@/widgets/model-picker";
import { pageProps } from "./page-props";
import type { PageParts, TerritoryViewerPageProps } from "./viewer-props";

/**
 * The canvas is a boundary: every value it needs crosses as a prop from the
 * container. These are type assertions rather than behaviour, and that is the
 * point — a prop added to `ViewerCanvasProps` upstream, or a widget prop
 * renamed, fails here instead of at the next live pass.
 */
describe("the page's prop shapes", () => {
  it("carries the canvas's whole surface, unmodified", () => {
    expectTypeOf<TerritoryViewerPageProps["canvas"]>().toEqualTypeOf<ViewerCanvasProps>();
  });

  it("hands the placements panel exactly what that widget asks for", () => {
    expectTypeOf<
      NonNullable<TerritoryViewerPageProps["panel"]>["placements"]
    >().toEqualTypeOf<PlacementsPanelProps>();
  });

  it("hands the picker exactly what the modal asks for", () => {
    expectTypeOf<TerritoryViewerPageProps["picker"]>().toEqualTypeOf<PlaceObjectsModalProps>();
  });

  it("is what the builder answers, so the page needs no widening", () => {
    expectTypeOf(pageProps).parameters.toEqualTypeOf<[PageParts]>();
    expectTypeOf(pageProps).returns.toEqualTypeOf<TerritoryViewerPageProps>();
  });
});
