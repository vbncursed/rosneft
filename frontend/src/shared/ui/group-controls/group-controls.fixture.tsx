import { useState } from "react";
import { EyeButton } from "./eye-button";
import { GroupRow } from "./group-row";
import { MoveToGroupMenu } from "./move-to-group-menu";

const noop = () => {};

function Phase() {
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(false);
  return (
    <GroupRow
      title="Prior job"
      line={hidden ? "3 panoramas · hidden" : "3 panoramas"}
      expanded={open}
      holdsSelection={false}
      onToggle={() => setOpen((o) => !o)}
      actions={<EyeButton state={hidden ? "hidden" : "visible"} subject="phase Prior job" onToggle={setHidden} />}
    />
  );
}

export default {
  eyes: (
    <div className="flex gap-2 rounded-card border border-line bg-panel p-6">
      <EyeButton state="visible" subject="visible item" onToggle={noop} />
      <EyeButton state="hidden" subject="hidden item" onToggle={noop} />
      <EyeButton state="mixed" subject="mixed group" onToggle={noop} />
      <EyeButton state="visible" subject="busy item" busy onToggle={noop} />
      <EyeButton state="visible" subject="empty group" disabled onToggle={noop} />
    </div>
  ),
  groupRow: (
    <div className="w-[300px] rounded-card border border-line bg-panel p-6">
      <Phase />
    </div>
  ),
  moveMenu: (
    <div className="flex justify-end rounded-card border border-line bg-panel p-6">
      <MoveToGroupMenu
        triggerLabel="Move Control room to another phase"
        targets={[
          { key: "current", label: "Current job" },
          { key: "post", label: "Post job" },
        ]}
        current={null}
        disabled={false}
        onMove={noop}
      />
    </div>
  ),
};
