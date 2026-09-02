import { useState } from "react";
import { ModelCard } from "./ui/model-card";
import { ModelPickerCard } from "./ui/model-picker-card";
import type { Model } from "./model/model";

const tank: Model = { slug: "storage-tank-500", title: "Tank 500", sourceBlobHash: "a" };
const pump: Model = { slug: "pump-jack", title: "Pump Jack", sourceBlobHash: "b" };
const flare: Model = { slug: "flare-stack", title: "Flare", sourceBlobHash: "c" };

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
  cards: (
    <div className="p-6 grid gap-4 md:grid-cols-2">
      <ModelCard
        model={{ ...flare, description: "Elevated flare with knockout drum." }}
        conversion={{ status: "ready" }}
      />
      <ModelCard model={tank} conversion={{ status: "converting", progress: 42 }} />
    </div>
  ),
  picker: (
    <div className="rounded-card border border-line bg-panel p-6">
      <Picker />
    </div>
  ),
};
