import type { Pt } from "@/entities/site-plan";

/** Container pixels = page points * k + (x, y). */
export type View = { k: number; x: number; y: number };

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 12;

const clampK = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

export function fitView(box: { w: number; h: number }, page: { width: number; height: number }): View {
  if (box.w <= 0 || box.h <= 0) return { k: 1, x: 0, y: 0 };
  const k = clampK(Math.min(box.w / page.width, box.h / page.height));
  return { k, x: (box.w - page.width * k) / 2, y: (box.h - page.height * k) / 2 };
}

/** Zoom by `factor` about the container point `at`, so that point keeps its page spot. */
export function zoomAt(view: View, factor: number, at: Pt): View {
  const k = clampK(view.k * factor);
  const f = k / view.k;
  return { k, x: at.x - (at.x - view.x) * f, y: at.y - (at.y - view.y) * f };
}

export const panBy = (view: View, dx: number, dy: number): View => ({ ...view, x: view.x + dx, y: view.y + dy });

export const toPage = (view: View, p: Pt): Pt => ({ x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k });
