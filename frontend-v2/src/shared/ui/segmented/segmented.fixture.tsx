import { useState } from "react";
import { Segmented } from "./segmented";

function Gizmo() {
  const [mode, setMode] = useState<"translate" | "rotate" | "scale">("translate");
  return (
    <Segmented
      ariaLabel="Gizmo mode"
      value={mode}
      onChange={setMode}
      items={[
        { value: "translate", label: "Move", hint: "T" },
        { value: "rotate", label: "Rotate", hint: "R" },
        { value: "scale", label: "Scale", hint: "S" },
      ]}
    />
  );
}

function Range() {
  const [range, setRange] = useState("6h");
  return (
    <Segmented
      ariaLabel="Time range"
      tone="soft"
      fill={false}
      value={range}
      onChange={setRange}
      items={[
        { value: "1h", label: "1h" },
        { value: "6h", label: "6h" },
        { value: "24h", label: "24h" },
        { value: "7d", label: "7d" },
      ]}
    />
  );
}

export default (
  <div className="flex max-w-sm flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <Gizmo />
    <Range />
  </div>
);
