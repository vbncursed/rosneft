import { useState } from "react";
import { ModelPickerCard } from "./ui/model-picker-card";
import type { Model } from "./model/model";

const tank: Model = { slug: "storage-tank-500", title: "Tank 500", sourceBlobHash: "a", usageCount: 0 };
const pump: Model = { slug: "pump-jack", title: "Pump Jack", sourceBlobHash: "b", usageCount: 0 };
const flare: Model = { slug: "flare-stack", title: "Flare", sourceBlobHash: "c", usageCount: 0 };

function Picker() {
  const [selected, setSelected] = useState("storage-tank-500");
  const [quantity, setQuantity] = useState(3);
  return (
    <div className="p-6 grid max-w-sm grid-cols-3 gap-2.5">
      <ModelPickerCard model={pump} selected={selected === pump.slug} onSelect={() => setSelected(pump.slug)} />
      <ModelPickerCard
        model={tank}
        selected={selected === tank.slug}
        onSelect={() => setSelected(tank.slug)}
        quantity={quantity}
        onQuantityChange={setQuantity}
      />
      <ModelPickerCard model={flare} selected={false} onSelect={() => {}} unavailable />
    </div>
  );
}

export default {
  "picker band + meta": (
    <div className="rounded-card border border-line bg-panel p-6">
      <div className="grid max-w-lg grid-cols-4 gap-2.5">
        <ModelPickerCard model={pump} selected={false} onSelect={() => {}} thumb="band" meta="2 LODs · 3.8 MB" />
        <ModelPickerCard model={tank} selected onSelect={() => {}} thumb="band" meta="3 LODs · 10.9 MB" />
        <ModelPickerCard model={flare} selected={false} onSelect={() => {}} thumb="band" unavailable />
      </div>
    </div>
  ),
  picker: (
    <div className="rounded-card border border-line bg-panel p-6">
      <Picker />
    </div>
  ),
};
