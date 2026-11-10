import { describe, expect, it } from "vitest";

import { extractPlanLabels, matchPlanLabels } from "./plan-labels";
import type { PlanRect } from "./detect-rects";

const viewport = [1, 0, 0, -1, 0, 100];
const rect = (x: number, y: number, size = 20): PlanRect => ({
  corners: [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ],
  widthPt: size,
  heightPt: size,
  angle: 0,
});

describe("extractPlanLabels", () => {
  it("reads ordinary text and only AutoCAD SHX Text annotations in page coordinates", () => {
    const labels = extractPlanLabels(
      {
        items: [
          { str: " Camp ", transform: [1, 0, 0, 1, 5, 95] },
          { str: " ", transform: [1, 0, 0, 1, 0, 0] },
        ],
      },
      [
        {
          subtype: "Square",
          titleObj: { str: "AutoCAD SHX Text" },
          contentsObj: { str: "Loading" },
          rect: [10, 80, 14, 84],
        },
        { subtype: "Text", titleObj: { str: "Comment" }, contentsObj: { str: "ignored" }, rect: [0, 0, 1, 1] },
      ],
      viewport,
    );
    expect(labels).toEqual([
      { text: "Camp", at: { x: 5, y: 5 }, source: "text" },
      { text: "Loading", at: { x: 12, y: 18 }, source: "shx" },
    ]);
  });
  it("ignores malformed or empty inputs", () => {
    expect(
      extractPlanLabels(
        { items: [] },
        [{ subtype: "Text", titleObj: { str: "AutoCAD SHX Text" }, contentsObj: { str: "x" }, rect: [0] }],
        viewport,
      ),
    ).toEqual([]);
  });
});

describe("matchPlanLabels", () => {
  const label = (text: string, x: number, y: number) => ({ text, at: { x, y }, source: "text" as const });
  it("matches one contained label and proposes a category", () => {
    expect(matchPlanLabels([rect(0, 0)], [label("Vehicle loading", 5, 5)])).toEqual([
      { rectIndex: 0, label: label("Vehicle loading", 5, 5), tagSlugs: ["loading", "vehicles"] },
    ]);
  });
  it("proposes only established tags and avoids conflicting categories", () => {
    expect(matchPlanLabels([rect(0, 0)], [label("CAMP", 5, 5)])[0].tagSlugs).toEqual(["camp"]);
    expect(matchPlanLabels([rect(0, 0)], [label("LOADING STATION", 5, 5)])[0].tagSlugs).toEqual([
      "loading",
      "vehicles",
    ]);
    expect(matchPlanLabels([rect(0, 0)], [label("CAMP LOADING STATION", 5, 5)])[0].tagSlugs).toEqual([]);
    expect(matchPlanLabels([rect(0, 0)], [label("STORAGE OFFICE", 5, 5)])[0].tagSlugs).toEqual([]);
  });
  it("rejects overlapping contours, multiple labels, boundaries and empty data", () => {
    expect(matchPlanLabels([rect(0, 0), rect(1, 1)], [label("Camp", 5, 5)])).toEqual([]);
    expect(matchPlanLabels([rect(0, 0)], [label("Camp", 5, 5), label("Office", 6, 6)])).toEqual([]);
    expect(matchPlanLabels([rect(0, 0)], [label("Camp", 0, 5)])).toEqual([]);
    expect(matchPlanLabels([], [])).toEqual([]);
  });
  it("leaves unknown labels without suggested tags", () => {
    expect(matchPlanLabels([rect(0, 0)], [label("Workshop X", 5, 5)])[0].tagSlugs).toEqual([]);
  });
});
