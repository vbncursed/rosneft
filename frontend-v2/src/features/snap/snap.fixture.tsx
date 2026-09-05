import { useState } from "react";
import { SnapToggle } from "./ui/snap-toggle";

function Live() {
  const [on, setOn] = useState(true);
  return <SnapToggle on={on} onToggle={() => setOn((v) => !v)} />;
}

export default (
  <div className="flex max-w-xs flex-col gap-3 rounded-card border border-line bg-panel p-6">
    <Live />
    <SnapToggle on={false} onToggle={() => {}} />
  </div>
);
