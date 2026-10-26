import { useEffect, useState } from "react";
import { assetUrl } from "@/entities/content";
import type { Document } from "@/entities/document";
import { openPdf, pageViewport, renderPage, type PdfDocument } from "@/entities/site-plan";
import { notify } from "@/shared/lib/notify";

export type PlanImage = { image: ImageBitmap; page: { width: number; height: number } };

/** The aligned page as a picture, and its size in points: all "Show plan" needs of the PDF. */
export function usePlanImage(document: Document | null): PlanImage | null {
  const [plan, setPlan] = useState<PlanImage | null>(null);
  const hash = document?.sourceBlobHash;
  const pageNumber = document?.calibration?.page ?? 1;

  useEffect(() => {
    if (!hash) return;
    let live = true;
    let opened: PdfDocument | null = null;
    let bitmap: ImageBitmap | null = null;
    (async () => {
      opened = await openPdf(assetUrl(hash));
      const page = await opened.getPage(pageNumber);
      const { width, height } = pageViewport(page);
      const image = await renderPage(page);
      if (!live) return image.close();
      bitmap = image;
      setPlan({ image, page: { width, height } });
    })().catch(() => live && notify.error("The plan could not be read."));
    return () => {
      live = false;
      // The picture is closed with the effect, so the state must not keep it.
      const closing = bitmap;
      closing?.close();
      setPlan((now) => (now?.image === closing ? null : now));
      void opened?.destroy?.();
    };
  }, [hash, pageNumber]);

  return plan;
}
