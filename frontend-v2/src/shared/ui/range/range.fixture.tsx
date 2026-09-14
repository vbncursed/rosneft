import { useState } from "react";
import { Range } from "./range";

function Opacity() {
  const [value, setValue] = useState(0.65);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex justify-between text-[13px] text-fg">
        <span>Photo opacity</span>
        <span className="font-mono text-[10px] text-muted">{Math.round(value * 100)} %</span>
      </p>
      <Range label="Photo opacity" value={value} min={0.15} max={1} step={0.05} onChange={setValue} />
    </div>
  );
}

function Yaw() {
  const [value, setValue] = useState(137.5);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex justify-between text-[13px] text-fg">
        <span>Yaw</span>
        <span className="font-mono text-[10px] text-muted">{value}°</span>
      </p>
      <Range label="Yaw" value={value} min={0} max={360} step={0.5} onChange={setValue} />
    </div>
  );
}

function Disabled() {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex justify-between text-[13px] text-fg">
        <span>Yaw</span>
        <span className="font-mono text-[10px] text-muted">0°</span>
      </p>
      <Range label="Yaw" value={0} min={0} max={360} step={0.5} onChange={() => {}} disabled />
    </div>
  );
}

export default (
  <div className="flex max-w-md flex-col gap-5 rounded-card border border-line bg-panel p-6">
    <Opacity />
    <Yaw />
    <Disabled />
  </div>
);
