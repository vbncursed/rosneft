import { useState } from "react";
import type { Model } from "@/entities/model";
import type { ModelOption } from "@/entities/scene";
import { ModelPicker } from "./ui/model-picker";
import { PlaceObjectsModal } from "./ui/place-objects-modal";

const model = (slug: string, title: string): Model => ({ slug, title, sourceBlobHash: "a", usageCount: 0 });

const MODELS = [
  { model: model("pump-jack", "Pump Jack") },
  { model: model("storage-tank-500", "Tank 500") },
  { model: model("flare-stack", "Flare"), unavailable: true },
];

const lods = (sizes: number[]): ModelOption["chain"] =>
  sizes.map((size, lod) => ({ lod, hash: `h${lod}`, size }));

const OPTIONS: ModelOption[] = [
  { slug: "storage-tank-500", title: "storage-tank-500", chain: lods([8_400_000, 2_100_000, 900_000]) },
  { slug: "pump-jack", title: "pump-jack", chain: lods([3_200_000, 800_000]) },
  { slug: "flare-stack", title: "flare-stack", chain: lods([5_700_000, 1_400_000, 600_000]) },
  { slug: "pipe-rack-12m", title: "pipe-rack-12m", chain: lods([1_900_000]) },
  { slug: "valve-station", title: "valve-station", chain: lods([2_400_000, 600_000]) },
  { slug: "cooling-tower", title: "cooling-tower", chain: [] },
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
  "place-objects": (
    <PlaceObjectsModal
      open
      onClose={() => {}}
      territoryTitle="Refinery Block C"
      options={OPTIONS}
      placing={null}
      onPlace={() => {}}
    />
  ),
  "place-objects placing": (
    <PlaceObjectsModal
      open
      onClose={() => {}}
      territoryTitle="Refinery Block C"
      options={OPTIONS}
      placing={{ done: 0, total: 2 }}
      onPlace={() => {}}
    />
  ),
  "picker band thumbs": (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <ModelPicker models={MODELS} selectedSlug="storage-tank-500" onSelect={() => {}} thumb="band" />
    </div>
  ),
  empty: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <ModelPicker models={[]} selectedSlug={null} onSelect={() => {}} />
    </div>
  ),
};
