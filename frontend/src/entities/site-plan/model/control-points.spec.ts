import { describe, expect, it } from "vitest";

import { controlPoints } from "./control-points";
import plan from "./__data__/mr1-plan.json";

const FLIP = [1, 0, 0, -1, 0, 100];
const item = (str: string, x: number, y: number) => ({ str, transform: [1.9, 0, 0, 1.9, x, y] });

describe("controlPoints on the MR1 plan", () => {
  const points = controlPoints(plan.text, plan.viewport);
  const me = (label: string) => points.find((p) => p.label === label)!;

  it("finds ME1, ME2 and ME3 with the printed E and N", () => {
    expect(me("ME1")).toMatchObject({ e: 436725.76, n: 4038088.52 });
    expect(me("ME2")).toMatchObject({ e: 436646.72, n: 4038121.91 });
    expect(me("ME3")).toMatchObject({ e: 436692.48, n: 4037987.61 });
  });

  it("anchors each label in top-down page points", () => {
    expect(me("ME1").at.x).toBeCloseTo(822.1, 1);
    expect(me("ME1").at.y).toBeCloseTo(1684 - 1363.6, 1);
  });

  it("agrees with UTM at 6.6 pt/m for every pair of ME points", () => {
    const mes = ["ME1", "ME2", "ME3"].map(me);
    for (const [a, b] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const page = Math.hypot(mes[a].at.x - mes[b].at.x, mes[a].at.y - mes[b].at.y);
      const utm = Math.hypot(mes[a].e - mes[b].e, mes[a].n - mes[b].n);
      expect(page / utm).toBeGreaterThan(6.59);
      expect(page / utm).toBeLessThan(6.61);
    }
  });

  it("accepts the general E: ... N: ... label", () => {
    const general = points.find((p) => !p.label.startsWith("ME"));
    expect(general).toMatchObject({ e: 436771.3, n: 4037966.226 });
    expect(points).toHaveLength(4);
  });
});

describe("controlPoints on synthetic text", () => {
  it("ignores a label whose N or E is missing", () => {
    const text = { items: [item("ME9", 10, 90), item("N:100.5", 10, 88)] };
    expect(controlPoints(text, FLIP)).toEqual([]);
  });

  it("does not take another label's lines", () => {
    const text = {
      items: [
        item("ME1", 10, 90),
        item("N:1", 10, 88),
        item("E:2", 10, 86),
        item("ME2", 60, 90),
        item("N:3", 60, 88),
        item("E:4", 60, 86),
      ],
    };
    const p = controlPoints(text, FLIP);
    expect(p.map((q) => [q.label, q.e, q.n])).toEqual([
      ["ME1", 2, 1],
      ["ME2", 4, 3],
    ]);
  });
});
