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

/** The viewer panel's gizmo toggle: mono 10, no side padding, a 300px panel. */
function GizmoCompact() {
  const [mode, setMode] = useState<"translate" | "rotate" | "scale">("translate");
  return (
    <Segmented
      ariaLabel="Gizmo mode"
      size="xs"
      tone="soft"
      value={mode}
      onChange={setMode}
      items={[
        { value: "translate", label: "Translate T" },
        { value: "rotate", label: "Rotate R" },
        { value: "scale", label: "Scale S" },
      ]}
    />
  );
}

export default {
  default: (
    <div className="flex max-w-sm flex-col gap-4 rounded-card border border-line bg-panel p-6">
      <Gizmo />
      <Range />
    </div>
  ),
  xs: (
    <div className="w-[272px] rounded-card border border-line bg-panel p-6">
      <GizmoCompact />
    </div>
  ),
};
