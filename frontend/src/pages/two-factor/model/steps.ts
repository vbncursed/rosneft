export type Flow = "enable" | "regenerate";
export type Stage = "confirm" | "codes";
export type StepTone = "active" | "done" | "pending";
export type Step = { label: string; tone: StepTone };

/**
 * The chips across the top of the wizard. Enabling is three steps because it
 * starts by pairing an app; regenerating is two, because the app is already
 * paired and pretending otherwise would show a step nobody performs.
 */
export function steps(flow: Flow, stage: Stage): Step[] {
  const codes: StepTone = stage === "codes" ? "active" : "pending";
  if (flow === "regenerate") {
    return [
      { label: "1 · confirm", tone: stage === "codes" ? "done" : "active" },
      { label: "2 · save codes", tone: codes },
    ];
  }
  const before: StepTone = stage === "codes" ? "done" : "active";
  return [
    { label: "1 · scan", tone: before },
    { label: "2 · confirm", tone: before },
    { label: "3 · save codes", tone: codes },
  ];
}
