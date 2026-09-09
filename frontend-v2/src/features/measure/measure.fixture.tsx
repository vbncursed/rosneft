import { useState } from "react";
import { MeasureButton } from "./ui/measure-button";

function Live() {
  const [active, setActive] = useState(false);
  return <MeasureButton active={active} onToggle={() => setActive((a) => !a)} />;
}

export default (
  <div className="flex gap-2 rounded-card border border-line bg-panel p-6">
    <Live />
    <MeasureButton active onToggle={() => {}} />
  </div>
);
