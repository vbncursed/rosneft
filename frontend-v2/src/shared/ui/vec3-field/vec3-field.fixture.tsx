import { useState } from "react";
import { Vec3Field } from "./vec3-field";

function Live() {
  const [value, setValue] = useState({ x: 12.4, y: 0, z: -3.1 });
  return <Vec3Field label="Position" value={value} onChange={setValue} />;
}

export default (
  <div className="flex max-w-sm flex-col gap-5 rounded-card border border-line bg-panel p-6">
    <Live />
    <Vec3Field label="Scale" value={{ x: 1, y: 1, z: 1 }} onChange={() => {}} disabled />
  </div>
);
