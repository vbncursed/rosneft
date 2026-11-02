// A stand-in for pdf.js over the small MR1 dump the site-plan entity is tested with.
import type { PdfDocument, PdfjsLib } from "@/entities/site-plan";
import plan from "../../../entities/site-plan/model/__data__/mr1-plan.json";

export const PLAN_PAGE = plan.page;

export const fakeLib = { OPS: plan.ops } as unknown as PdfjsLib;

export const fakePdf = (numPages = 1): PdfDocument =>
  ({
    numPages,
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: plan.page.width * scale,
        height: plan.page.height * scale,
        transform: plan.viewport.map((v) => v * scale),
      }),
      getOperatorList: async () => plan.opList,
      getTextContent: async () => plan.text,
    }),
  }) as unknown as PdfDocument;

// UTM box around ME1..ME3 and the general label; 300 m across = 2 scene units.
export const UTM_BBOX = { min: { x: 436600, y: 0, z: -4038200 }, max: { x: 436800, y: 50, z: -4037900 } };
export const UNIT_RATIO = 150;
