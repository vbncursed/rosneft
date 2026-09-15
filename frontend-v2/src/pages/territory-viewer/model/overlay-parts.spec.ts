import { describe, expectTypeOf, it } from "vitest";
import type { usePipWindow } from "@/features/document-view";
import type { DocumentWindowProps } from "@/widgets/document-window";
import type { UploadModalProps } from "@/widgets/upload-modal";
import type { ViewerCanvasProps } from "@/widgets/viewer-canvas";
import type { DocumentParts, PanoramaParts } from "./overlay-parts";

/**
 * The couplings the two composite hooks are built to hold. These are type
 * assertions rather than behaviour, and that is the point: the hooks fill
 * these shapes and the builders read them, so a widget prop renamed upstream
 * fails here rather than at the next live pass.
 */
describe("the overlay part shapes", () => {
  it("carries the pip geometry the window hook actually produces", () => {
    expectTypeOf<DocumentParts["pip"]>().toEqualTypeOf<ReturnType<typeof usePipWindow>>();
    expectTypeOf<DocumentParts["pip"]>().toEqualTypeOf<DocumentWindowProps["pip"]>();
  });

  it("carries each upload form whole, so the one dialog can be built from either", () => {
    expectTypeOf<PanoramaParts["upload"]["form"]["upload"]>().toEqualTypeOf<
      UploadModalProps["upload"]
    >();
    expectTypeOf<DocumentParts["upload"]["form"]["upload"]>().toEqualTypeOf<
      UploadModalProps["upload"]
    >();
  });

  it("describes the sphere exactly as the canvas asks for it", () => {
    expectTypeOf<PanoramaParts["texture"]["bitmap"]>().toEqualTypeOf<
      ViewerCanvasProps["panoramaBitmap"]
    >();
    expectTypeOf<PanoramaParts["texture"]["status"]>().toEqualTypeOf<
      ViewerCanvasProps["panoramaStatus"]
    >();
    expectTypeOf<PanoramaParts["list"]>().toEqualTypeOf<ViewerCanvasProps["panoramas"]>();
  });
});
