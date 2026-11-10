import type { PdfAnnotation, PdfTextContent } from "../api/pdfjs";

import type { PlanRect } from "./detect-rects";
import { apply, type Pt } from "./geometry";

export interface PlanLabel {
  text: string;
  at: Pt;
  source: "text" | "shx";
}

export type PlanTagSlug = "camp" | "loading" | "vehicles";
export interface LabelMatch {
  rectIndex: number;
  label: PlanLabel;
  tagSlugs: PlanTagSlug[];
}

const valid = (values: number[], length: number): boolean =>
  values.length >= length && values.slice(0, length).every(Number.isFinite);

export function extractPlanLabels(text: PdfTextContent, annotations: PdfAnnotation[], viewport: number[]): PlanLabel[] {
  if (!valid(viewport, 6)) return [];
  const ordinary: PlanLabel[] = text.items.flatMap((item) => {
    if (!("str" in item) || !item.str.trim() || !valid(item.transform, 6)) return [];
    return [{ text: item.str.trim(), at: apply(viewport, item.transform[4], item.transform[5]), source: "text" }];
  });
  const shx: PlanLabel[] = annotations.flatMap((annotation) => {
    const value = annotation.contentsObj?.str.trim();
    const rect = annotation.rect;
    if (
      (annotation.subtype !== "Text" && annotation.subtype !== "Square") ||
      annotation.titleObj?.str !== "AutoCAD SHX Text" ||
      !value ||
      !rect ||
      !valid(rect, 4)
    )
      return [];
    return [{ text: value, at: apply(viewport, (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2), source: "shx" }];
  });
  return [...ordinary, ...shx];
}

const TAGS: [RegExp, PlanTagSlug[]][] = [
  [/\b(?:camp|accommodation)\b|лагер|общежит/iu, ["camp"]],
  [/\bloading\b|погруз/iu, ["loading", "vehicles"]],
];

function suggestedTags(text: string): PlanTagSlug[] {
  const matches = TAGS.filter(([pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][1] : [];
}

// Strictly inside the convex quadrilateral: edge labels are ambiguous.
function inside(point: Pt, rect: PlanRect): boolean {
  const signs = rect.corners.map((a, i) => {
    const b = rect.corners[(i + 1) % rect.corners.length];
    return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  });
  return signs.every((s) => s > 1e-8) || signs.every((s) => s < -1e-8);
}

export function matchPlanLabels(rects: PlanRect[], labels: PlanLabel[]): LabelMatch[] {
  const relations = labels.map((label) => rects.flatMap((rect, index) => (inside(label.at, rect) ? [index] : [])));
  return labels.flatMap((label, i) => {
    const [rectIndex] = relations[i];
    if (relations[i].length !== 1 || relations.filter((indices) => indices.includes(rectIndex)).length !== 1) return [];
    return [{ rectIndex, label, tagSlugs: suggestedTags(label.text) }];
  });
}
