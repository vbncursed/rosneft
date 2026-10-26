// The only module that touches pdf.js. It is vendored in public/pdfjs (not an
// npm dependency) and loaded on demand, so it never enters the main chunk.

export interface PdfViewport {
  width: number;
  height: number;
  transform: number[];
}

export interface PdfPage {
  getViewport(opts: { scale: number; rotation: number }): PdfViewport;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getTextContent(): Promise<{ items: { str: string; transform: number[] }[] }>;
  render(opts: { canvas: HTMLCanvasElement; viewport: PdfViewport }): { promise: Promise<void> };
}

export interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}

export interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string };
  OPS: Record<string, number>;
  getDocument(src: { data?: Uint8Array; url?: string; isEvalSupported: boolean }): { promise: Promise<PdfDocument> };
}

// A variable, not a literal: Vite refuses to bundle a file that lives in public/.
const PDFJS_URL = "/pdfjs/build/pdf.mjs";
const WORKER_URL = "/pdfjs/build/pdf.worker.mjs";

let loading: Promise<PdfjsLib> | null = null;

export function loadPdfjs(): Promise<PdfjsLib> {
  loading ??= (import(/* @vite-ignore */ PDFJS_URL) as Promise<PdfjsLib>).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = WORKER_URL;
    return lib;
  });
  loading.catch(() => (loading = null));
  return loading;
}

export async function openPdf(source: Uint8Array | string): Promise<PdfDocument> {
  const lib = await loadPdfjs();
  const src = typeof source === "string" ? { url: source } : { data: source };
  return lib.getDocument({ ...src, isEvalSupported: false }).promise;
}

// Rotation 0 whatever the page's /Rotate says: the maths works in unrotated
// page points, and the rendered bitmap must use the same frame.
export const pageViewport = (page: PdfPage): PdfViewport => page.getViewport({ scale: 1, rotation: 0 });
