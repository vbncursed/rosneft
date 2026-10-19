import { KeycapHint } from "@/shared/ui/keycap-hint";

const KEYS: [key: string, action: string][] = [
  ["WASD", "move"],
  ["Q/E", "down / up"],
  ["Shift", "faster"],
  ["Wheel", "speed"],
  ["Esc", "exit"],
];

/**
 * The free cam's keys, under its mode chip. They sit in the tool column, not in
 * the bottom-right corner the orbit's hints use: that corner is under the
 * Overlays panel, and the free cam runs with the panel open. Shown and hidden
 * with the mode, at once — a key turned it on.
 */
export function FreeCamKeys() {
  return (
    <div role="note" aria-label="Free cam keys" className="flex max-w-[380px] flex-wrap gap-1.5">
      {KEYS.map(([key, action]) => (
        <KeycapHint key={key} keyLabel={key}>
          {action}
        </KeycapHint>
      ))}
    </div>
  );
}
