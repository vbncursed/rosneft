import { useState } from "react";
import type { PlanRect, Pt } from "@/entities/site-plan";
import { SitePlanWindow } from "./index";

const rect = (x: number, y: number, w: number, h: number): PlanRect => ({
  corners: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
  widthPt: w,
  heightPt: h,
  angle: 0,
});

const RECTS = [rect(60, 60, 49.5, 85.8), rect(180, 70, 66, 40), rect(300, 90, 33, 33)];
const SAVED = [
  {
    id: 1,
    title: "Tank row",
    corners: [
      { x: 60, y: 200 },
      { x: 200, y: 200 },
      { x: 200, y: 250 },
      { x: 60, y: 250 },
    ],
  },
];

function Live() {
  const [selected, setSelected] = useState<number | null>(0);
  const [pairs, setPairs] = useState<{ pdf: Pt }[]>([{ pdf: { x: 40, y: 40 } }, { pdf: { x: 340, y: 240 } }]);
  return (
    <div className="relative h-[560px]">
      <SitePlanWindow
        image={null}
        pageSize={{ width: 400, height: 300 }}
        rects={RECTS}
        zones={SAVED}
        pairs={pairs}
        selected={selected}
        metresPerPt={1 / 6.6}
        onSelectRect={(i) => setSelected((now) => (now === i ? null : i))}
        onDragPair={(i, to) => setPairs((all) => all.map((p, j) => (j === i ? { pdf: to } : p)))}
        onPlanClick={() => setSelected(null)}
      />
    </div>
  );
}

export default { "rectangles over a blank page": <Live /> };
