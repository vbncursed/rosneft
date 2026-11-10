import type { PlanRect, Pt } from "@/entities/site-plan";

export type ManualRect = { x: number; y: number; width: number; height: number; angle: number };

export function manualRect({ x, y, width, height, angle }: ManualRect): PlanRect {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corner = (u: number, v: number): Pt => ({ x: x + u * cos - v * sin, y: y + u * sin + v * cos });
  return {
    corners: [
      corner(-width / 2, -height / 2),
      corner(width / 2, -height / 2),
      corner(width / 2, height / 2),
      corner(-width / 2, height / 2),
    ],
    widthPt: width,
    heightPt: height,
    angle: radians,
  };
}

export function rectFromDrag(a: Pt, b: Pt): PlanRect {
  return manualRect({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
    angle: 0,
  });
}
