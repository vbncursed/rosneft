import { useState } from "react";
import { QuantityStepper } from "./quantity-stepper";

function Live() {
  const [value, setValue] = useState(4);
  return <QuantityStepper value={value} onChange={setValue} min={1} max={9} />;
}

export default (
  <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-6">
    <Live />
    <QuantityStepper value={1} min={1} onChange={() => {}} />
    <p className="m-0 text-[11px] text-dim">min reached → “−” disabled</p>
  </div>
);
