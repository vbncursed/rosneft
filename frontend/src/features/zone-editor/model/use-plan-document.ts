import { useEffect, useState } from "react";
import { assetUrl } from "@/entities/content";
import type { Document } from "@/entities/document";
import {
  controlPoints,
  detectRects,
  extractPaths,
  loadPdfjs,
  MIN_SIDE_PT_UNSCALED,
  openPdf,
  pageViewport,
  renderPage,
  type ControlPoint,
  type PdfDocument,
  type PlanRect,
} from "@/entities/site-plan";

type PageData = {
  page: number;
  image: ImageBitmap;
  rects: PlanRect[];
  controls: ControlPoint[];
  pageSize: { width: number; height: number };
};

export type PlanDocument = {
  status: "loading" | "ready" | "error";
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  /** Everything below is empty/null until the current page has been read. */
  image: ImageBitmap | null;
  rects: PlanRect[];
  controls: ControlPoint[] | null;
  pageSize: { width: number; height: number } | null;
};

const WHOLE_DOCUMENT = 0;

/** Opens the document's PDF and reads one page at a time: picture, rectangles, survey labels. */
export function usePlanDocument(document: Document): PlanDocument {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(document.calibration?.page ?? 1);
  const [data, setData] = useState<PageData | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    let opened: PdfDocument | null = null;
    openPdf(assetUrl(document.sourceBlobHash)).then(
      (doc) => {
        opened = doc;
        if (live) setPdf(doc);
        else void doc.destroy?.();
      },
      () => live && setFailedPage(WHOLE_DOCUMENT),
    );
    return () => {
      live = false;
      void opened?.destroy?.();
    };
  }, [document.sourceBlobHash]);

  useEffect(() => {
    if (!pdf) return;
    let live = true;
    let bitmap: ImageBitmap | null = null;
    (async () => {
      const [lib, pdfPage] = await Promise.all([loadPdfjs(), pdf.getPage(page)]);
      const viewport = pageViewport(pdfPage);
      const [ops, text] = await Promise.all([pdfPage.getOperatorList(), pdfPage.getTextContent()]);
      const pageSize = { width: viewport.width, height: viewport.height };
      const paths = extractPaths(ops, lib.OPS, viewport.transform);
      const image = await renderPage(pdfPage);
      if (!live) return image.close();
      bitmap = image;
      setData({
        page,
        image,
        pageSize,
        rects: detectRects(paths, pageSize, MIN_SIDE_PT_UNSCALED),
        controls: controlPoints(text, viewport.transform),
      });
    })().catch(() => live && setFailedPage(page));
    return () => {
      live = false;
      // The picture is closed with the effect, so the state must not keep it.
      const closing = bitmap;
      closing?.close();
      setData((now) => (now?.image === closing ? null : now));
    };
  }, [pdf, page]);

  const current = data?.page === page ? data : null;
  const failed = failedPage === WHOLE_DOCUMENT || failedPage === page;
  return {
    status: current ? "ready" : failed ? "error" : "loading",
    page,
    pageCount: pdf?.numPages ?? 1,
    setPage,
    image: current?.image ?? null,
    rects: current?.rects ?? [],
    controls: current?.controls ?? null,
    pageSize: current?.pageSize ?? null,
  };
}
