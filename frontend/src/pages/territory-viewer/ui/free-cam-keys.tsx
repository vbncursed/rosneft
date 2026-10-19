import { KeycapHint } from "@/shared/ui/keycap-hint";
import type { FreeKeys } from "../model/viewer-props";

type Row = [key: string, action: string];

const FLY: Row[] = [
  ["WASD", "move"],
  ["Q/E", "down / up"],
  ["Shift", "faster"],
  ["Wheel", "speed"],
  ["G", "walk"],
  ["Esc", "exit"],
];
/** No up or down on foot: Q/E are left out, not greyed. */
const WALK: Row[] = [
  ["WASD", "move"],
  ["Shift", "run"],
  ["Wheel", "speed"],
  ["G", "fly"],
  ["Esc", "exit"],
];
const NO_SCALE: Row[] = FLY.map((row): Row => (row[0] === "G" ? ["G", "no walk · dimensions unknown"] : row));
const ROWS: Record<FreeKeys, Row[]> = { fly: FLY, walk: WALK, "fly-no-scale": NO_SCALE };

/**
 * The free cam's keys, under its mode chip. They sit in the tool column, not in
 * the bottom-right corner the orbit's hints use: that corner is under the
 * Overlays panel, and the free cam runs with the panel open. Shown and hidden
 * with the mode, at once — a key turned it on, so the row changes at once too.
 */
export function FreeCamKeys({ mode }: { mode: FreeKeys }) {
  return (
    <div role="note" aria-label="Free cam keys" className="flex max-w-[380px] flex-wrap gap-1.5">
      {ROWS[mode].map(([key, action]) => (
        <KeycapHint key={key} keyLabel={key}>
          {action}
        </KeycapHint>
      ))}
    </div>
  );
}
