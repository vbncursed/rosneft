import { useState } from "react";
import { Vec3Field } from "./vec3-field";

function Live() {
  const [value, setValue] = useState({ x: 12.4, y: 0, z: -3.1 });
  return <Vec3Field label="Position" value={value} onChange={setValue} />;
}

const dp3 = (n: number) => n.toFixed(3);
const degrees = (n: number) => `${Math.round((n * 180) / Math.PI)}°`;

function LiveRow() {
  const [value, setValue] = useState({ x: 18.2, y: 0, z: -4.05 });
  return <Vec3Field layout="row" label="Pos" value={value} onChange={setValue} />;
}

export default {
  stack: (
    <div className="flex max-w-sm flex-col gap-5 rounded-card border border-line bg-panel p-6">
      <Live />
      <Vec3Field label="Scale" value={{ x: 1, y: 1, z: 1 }} onChange={() => {}} disabled />
    </div>
  ),
  row: (
    <div className="flex w-[292px] flex-col gap-[7px] rounded-card border border-line bg-panel p-3.5">
      <Vec3Field
        layout="row"
        readOnly
        label="Pos"
        value={{ x: 12.4, y: 0, z: -8.25 }}
        onChange={() => {}}
        format={dp3}
      />
      <Vec3Field
        layout="row"
        readOnly
        label="Rot"
        value={{ x: 0, y: Math.PI / 2, z: 0 }}
        onChange={() => {}}
        format={degrees}
      />
      <Vec3Field
        layout="row"
        readOnly
        label="Scl"
        value={{ x: 1, y: 1, z: 1 }}
        onChange={() => {}}
        format={dp3}
      />
      <LiveRow />
    </div>
  ),
};
