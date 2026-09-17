import { useState } from "react";
import { DatePicker } from "./date-picker";

function Live() {
  const [value, setValue] = useState("2026-08-24");
  return <DatePicker label="From" value={value} onChange={setValue} today="2026-08-31" />;
}

export default (
  <div className="flex flex-col gap-3.5 rounded-card border border-line bg-panel p-6">
    <Live />
    <DatePicker label="To" value="" onChange={() => {}} />
    <DatePicker label="Locked" value="2026-08-24" onChange={() => {}} disabled />
  </div>
);
