import { useEffect, useState } from "react";
import { assetUrl } from "@/entities/content";
import type { Document } from "@/entities/document";
import {
  controlPoints,
  displayContentConfig,
  detectRects,
  extractPaths,
  extractPlanLabels,
  loadPdfjs,
  MIN_SIDE_PT_UNSCALED,
  openPdf,
  pageViewport,
  renderPage,
  type ControlPoint,
  type PdfDocument,
  type PlanRect,
  type PlanLabel,
  type PdfOptionalContentConfig,
  type PdfOptionalContentOrder,
} from "@/entities/site-plan";

type Layer = { id: string; name: string; visible: boolean };

type PageData = {
  source: string;
  layers: Layer[];
  page: number;
  image: ImageBitmap;
  rects: PlanRect[];
  controls: ControlPoint[];
  labels: PlanLabel[];
  annotationWarning: string | null;
  pageSize: { width: number; height: number };
};

export type PlanDocument = {
  status: "loading" | "ready" | "error";
  page: number;
  pageCount: number;
  layers: Layer[];
  toggleLayer: (id: string) => void;
  setPage: (page: number) => void;
  /** Everything below is empty/null until the current page has been read. */
  image: ImageBitmap | null;
  rects: PlanRect[];
  controls: ControlPoint[] | null;
  labels: PlanLabel[];
  annotationWarning: string | null;
  pageSize: { width: number; height: number } | null;
};

const WHOLE_DOCUMENT = 0;

/** Opens the document's PDF and reads one page at a time: picture, rectangles, survey labels. */
export function usePlanDocument(document: Document): PlanDocument {
  const source = document.sourceBlobHash;
  const [pdfState, setPdf] = useState<{ source: string; value: PdfDocument } | null>(null);
  const [pageState, setPage] = useState<{ source: string; value: number }>({
    source,
    value: document.calibration?.page ?? 1,
  });
  const [layerState, setLayers] = useState<{ source: string; value: Layer[] } | null>(null);
  const [data, setData] = useState<PageData | null>(null);
  const [failure, setFailure] = useState<{ source: string; page: number } | null>(null);
  const pdf = pdfState?.source === source ? pdfState.value : null;
  const page = pageState.source === source ? pageState.value : (document.calibration?.page ?? 1);
  const layers = layerState?.source === source ? layerState.value : null;

  useEffect(() => {
    let live = true;
    let opened: PdfDocument | null = null;
    openPdf(assetUrl(source)).then(
      (doc) => {
        opened = doc;
        if (live) {
          setPdf({ source, value: doc });
          void displayContentConfig(doc).then(
            (config) => {
              if (live) setLayers({ source, value: readLayers(config) });
            },
            () => live && setFailure({ source, page: WHOLE_DOCUMENT }),
          );
        } else void doc.destroy?.();
      },
      () => live && setFailure({ source, page: WHOLE_DOCUMENT }),
    );
    return () => {
      live = false;
      void opened?.destroy?.();
    };
  }, [source]);

  useEffect(() => {
    if (!pdf || !layers) return;
    let live = true;
    let bitmap: ImageBitmap | null = null;
    (async () => {
      const [lib, pdfPage, config] = await Promise.all([loadPdfjs(), pdf.getPage(page), displayContentConfig(pdf)]);
      for (const layer of layers) {
        (config.setVisibility as (id: string, visible: boolean, preserveRB: boolean) => void)(
          layer.id,
          layer.visible,
          false,
        );
      }
      const viewport = pageViewport(pdfPage);
      const [ops, text, annotationResult] = await Promise.all([
        pdfPage.getOperatorList(),
        pdfPage.getTextContent(),
        pdfPage.getAnnotations({ intent: "display" }).then(
          (annotations) => ({ annotations, failed: false }),
          () => ({ annotations: [], failed: true }),
        ),
      ]);
      const pageSize = { width: viewport.width, height: viewport.height };
      const paths = extractPaths(ops, lib.OPS, viewport.transform, config);
      const image = await renderPage(pdfPage, undefined, Promise.resolve(config));
      if (!live) return image.close();
      bitmap = image;
      setData({
        source,
        page,
        layers,
        image,
        pageSize,
        rects: detectRects(paths, pageSize, MIN_SIDE_PT_UNSCALED),
        controls: controlPoints(text, viewport.transform),
        // pdf.js text extraction does not expose OCG membership; exclude ordinary text when layers exist.
        labels: extractPlanLabels(
          layers.length ? { items: [] } : text,
          annotationResult.annotations,
          viewport.transform,
        ),
        annotationWarning: annotationResult.failed
          ? "PDF annotations could not be read; SHX labels are unavailable."
          : null,
      });
    })().catch(() => live && setFailure({ source, page }));
    return () => {
      live = false;
      // The picture is closed with the effect, so the state must not keep it.
      const closing = bitmap;
      closing?.close();
      setData((now) => (now?.image === closing ? null : now));
    };
  }, [pdf, page, layers, source]);

  const current = data?.source === source && data.page === page && data.layers === layers ? data : null;
  const failed = failure?.source === source && (failure.page === WHOLE_DOCUMENT || failure.page === page);
  return {
    status: current ? "ready" : failed ? "error" : "loading",
    page,
    pageCount: pdf?.numPages ?? 1,
    layers: layers ?? [],
    toggleLayer: (id) =>
      setLayers((all) =>
        all?.source === source
          ? {
              source,
              value: all.value.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)),
            }
          : all,
      ),
    setPage: (value) => setPage({ source, value }),
    image: current?.image ?? null,
    rects: current?.rects ?? [],
    controls: current?.controls ?? null,
    labels: current?.labels ?? [],
    annotationWarning: current?.annotationWarning ?? null,
    pageSize: current?.pageSize ?? null,
  };
}

function readLayers(config: PdfOptionalContentConfig): Layer[] {
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };
  const walk = (order: PdfOptionalContentOrder) => {
    for (const item of order) {
      if (typeof item === "string") add(item);
      else walk(item.order);
    }
  };
  walk(config.getOrder() ?? []);
  const iterable = config as PdfOptionalContentConfig & {
    [Symbol.iterator]?: () => Iterator<[string, unknown]>;
    getGroups?: () => Record<string, unknown> | null;
  };
  if (iterable[Symbol.iterator]) for (const [id] of iterable as Iterable<[string, unknown]>) add(id);
  for (const id of Object.keys(iterable.getGroups?.() ?? {})) add(id);
  return ids.flatMap((id) => {
    const group = config.getGroup(id);
    return group?.name ? [{ id, name: group.name, visible: group.visible }] : [];
  });
}
