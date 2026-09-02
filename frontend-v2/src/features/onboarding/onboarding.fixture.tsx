import { useState } from "react";
import { TourTooltip } from "./ui/tour-tooltip";

const STEPS = [
  { title: "Territory catalog", body: "Every scene your company has uploaded lives here." },
  { title: "Placements panel", body: "Drop a model onto the scene and adjust its transform with the gizmo." },
  { title: "Measure tool", body: "Two clicks on any surface give you the distance between them." },
  { title: "Panoramas", body: "Walk the site from a fixed point and place markers." },
  { title: "Change journal", body: "Every edit is recorded, with the fields that moved." },
];

function Tour() {
  const [step, setStep] = useState(2);
  const current = STEPS[step - 1];
  return (
    <TourTooltip
      step={step}
      total={STEPS.length}
      title={current.title}
      body={current.body}
      onNext={() => setStep((s) => Math.min(STEPS.length, s + 1))}
      onBack={() => setStep((s) => Math.max(1, s - 1))}
      onSkip={() => setStep(1)}
    />
  );
}

export default (
  <div className="rounded-card border border-line bg-panel p-6">
    <Tour />
  </div>
);
