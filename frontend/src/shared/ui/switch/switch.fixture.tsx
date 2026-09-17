import { useState } from "react";
import { Switch } from "./switch";

const KBD_G = (
  <kbd className="rounded-[4px] border border-line-2 px-[5px] py-px text-fg">G</kbd>
);

function Live() {
  const [on, setOn] = useState(true);
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-line-2 bg-panel-2 px-[11px] py-2 text-[10px] text-fg">
      <span>Snap to surface {KBD_G}</span>
      <Switch checked={on} onChange={setOn} label="Snap to surface" />
    </div>
  );
}

export default {
  on: (
    <div className="max-w-xs rounded-card border border-line bg-panel p-6">
      <Live />
    </div>
  ),
  off: (
    <div className="flex max-w-xs items-center justify-between gap-3 rounded-card border border-line bg-panel p-6">
      <span className="text-[10px] text-fg">Snap to surface {KBD_G}</span>
      <Switch checked={false} onChange={() => {}} label="Snap to surface" />
    </div>
  ),
  disabled: (
    <div className="flex max-w-xs items-center justify-between gap-3 rounded-card border border-line bg-panel p-6">
      <span className="text-[10px] text-fg">Snap to surface {KBD_G}</span>
      <Switch checked disabled onChange={() => {}} label="Snap to surface" />
    </div>
  ),
};
