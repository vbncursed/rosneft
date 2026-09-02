import { useState } from "react";
import { ModelPicker } from "./ui/model-picker";
import type { Model } from "@/entities/model";

const model = (slug: string, title: string): Model => ({ slug, title, sourceBlobHash: "a" });

const MODELS = [
  { model: model("pump-jack", "Pump Jack") },
  { model: model("storage-tank-500", "Tank 500") },
  { model: model("flare-stack", "Flare"), unavailable: true },
];

function Live() {
  const [selected, setSelected] = useState("storage-tank-500");
  const [quantities, setQuantities] = useState<Record<string, number>>({ "storage-tank-500": 3 });
  return (
    <ModelPicker
      models={MODELS}
      selectedSlug={selected}
      onSelect={setSelected}
      quantities={quantities}
      onQuantityChange={(slug, quantity) => setQuantities((q) => ({ ...q, [slug]: quantity }))}
    />
  );
}

export default {
  picker: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <Live />
    </div>
  ),
  empty: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <ModelPicker models={[]} selectedSlug={null} onSelect={() => {}} />
    </div>
  ),
};
