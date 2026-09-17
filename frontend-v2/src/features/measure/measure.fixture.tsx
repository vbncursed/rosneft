import type { Chain } from "@/entities/measurement";
import { ModeChip } from "@/shared/ui/mode-chip";
import { measureSummary } from "./model/measure-summary";

// A closed-off two-segment chain and the converter's typical normalised
// unit ratio (max source axis / 2) — the same numbers the design mock's
// measure chip shows.
const SAMPLE: Chain = {
  id: 1,
  points: [
    { x: 0, y: 0, z: 0 },
    { x: 5, y: 0, z: 0 },
    { x: 10.275, y: 0, z: 0 },
  ],
  closed: false,
  sync: "local",
};
const UNIT_RATIO = 2;

const { segments, total } = measureSummary([SAMPLE], UNIT_RATIO);

export default (
  <div className="rounded-card border border-line bg-panel p-6">
    <ModeChip>
      measure · {segments} segments · {total} total
    </ModeChip>
  </div>
);
