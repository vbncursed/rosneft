export {
  displayContentConfig,
  loadPdfjs,
  openPdf,
  pageViewport,
  type PdfAnnotation,
  type PdfTextContent,
  type PdfDocument,
  type PdfPage,
  type PdfOptionalContent,
  type PdfOptionalContentConfig,
  type PdfOptionalContentOrder,
  type PdfViewport,
  type PdfjsLib,
} from "./api/pdfjs";
export { renderPage } from "./api/render-page";
export { autoPairs, type CalibrationPair } from "./model/auto-pairs";
export { controlPoints, type ControlPoint } from "./model/control-points";
export { detectRects, MIN_SIDE_PT_UNSCALED, type PlanRect } from "./model/detect-rects";
export { controlScale, drawingScale, planScale, scaleDifference } from "./model/drawing-scale";
export { extractPaths, type PagePath } from "./model/extract-paths";
export { applyFit, fitSimilarity, type FitResult, type Similarity } from "./model/fit-similarity";
export type { Pt } from "./model/geometry";
export { zoneFromRect, type ZoneBody } from "./model/zone-from-rect";

export {
  extractPlanLabels,
  matchPlanLabels,
  type PlanLabel,
  type PlanTagSlug,
  type LabelMatch,
} from "./model/plan-labels";
export { selectRegistrationPairs } from "./model/auto-registration";
