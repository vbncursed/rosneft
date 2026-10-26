export {
  loadPdfjs,
  openPdf,
  pageViewport,
  type PdfDocument,
  type PdfPage,
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
