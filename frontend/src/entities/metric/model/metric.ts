/**
 * A single dashboard reading. `value: null` and `unavailable` are different
 * things: one is "we have not heard back yet", the other is "we asked and
 * could not get it". Collapsing them hides an outage behind a spinner.
 */
export type MetricState =
  | { kind: "loading" }
  | { kind: "value"; value: string }
  | { kind: "unavailable" };

/** What the tile prints. The glyphs come from the design system's Data section. */
export function readout(state: MetricState): string {
  if (state.kind === "loading") return "…";
  if (state.kind === "unavailable") return "—";
  return state.value;
}

/**
 * Spoken form of the same thing. The glyphs alone are ambiguous, and colour is
 * not an accessible way to tell "still loading" from "we could not get it".
 */
export function readoutLabel(label: string, state: MetricState): string {
  if (state.kind === "loading") return `${label}: loading`;
  if (state.kind === "unavailable") return `${label}: unavailable`;
  return `${label}: ${state.value}`;
}

export type AlertSeverity = "firing" | "pending";
