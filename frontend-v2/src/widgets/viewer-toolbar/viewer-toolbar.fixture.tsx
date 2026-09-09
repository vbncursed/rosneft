import { useState } from "react";
import { MeasureButton } from "@/features/measure";
import { ViewerToolbar } from "./ui/viewer-toolbar";

function Live() {
  const [measuring, setMeasuring] = useState(true);
  const [count, setCount] = useState(3);
  return (
    <ViewerToolbar
      onResetCamera={() => {}}
      onShowHelp={() => {}}
      tools={<MeasureButton active={measuring} onToggle={() => setMeasuring((m) => !m)} />}
      measurementCount={count}
      onClearMeasurements={() => setCount(0)}
    />
  );
}

export default (
  <div className="flex flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <Live />
    <ViewerToolbar
      onResetCamera={() => {}}
      onShowHelp={() => {}}
      tools={<MeasureButton active={false} onToggle={() => {}} />}
    />
  </div>
);
