import { pageViewport, type PdfOptionalContentConfig, type PdfPage } from "./pdfjs";

const MAX_PX = 4096;

// renderPage draws the page at the largest scale whose longer side fits maxPx.
export async function renderPage(
  page: PdfPage,
  maxPx = MAX_PX,
  optionalContentConfigPromise?: Promise<PdfOptionalContentConfig>,
): Promise<ImageBitmap> {
  const base = pageViewport(page);
  const scale = maxPx / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale, rotation: 0 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport, intent: "display", optionalContentConfigPromise }).promise;
  return createImageBitmap(canvas);
}
