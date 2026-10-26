import type { ModelOption } from "@/entities/scene";
import type { Zone } from "@/entities/zone";

export const ZONE: Zone = {
  id: 1,
  title: "Tank row",
  corners: [
    { x: 0, y: 3, z: 0 },
    { x: 0.2, y: 3, z: 0 },
    { x: 0.2, y: 3, z: 0.1 },
    { x: 0, y: 3, z: 0.1 },
  ],
  tags: [
    { slug: "tanks", title: "Tanks" },
    { slug: "pumps", title: "Pumps" },
  ],
  drawingWidthM: 10,
  drawingHeightM: 5,
  createdAt: "",
  updatedAt: "",
};

const option = (slug: string, title: string, tagSlug: string, tagTitle: string): ModelOption => ({
  slug,
  title,
  tag: { slug: tagSlug, title: tagTitle },
  chain: [],
});

/** Two that match the zone, a crane that does not, and an ungrouped model that must never match. */
export const OPTIONS: ModelOption[] = [
  option("tank-500", "storage-tank-500", "tanks", "Tanks"),
  option("pump-1", "transfer-pump", "pumps", "Pumps"),
  option("crane-1", "overhead-crane", "cranes", "Cranes"),
  option("barrel", "loose-barrel", "ungrouped", "Ungrouped"),
];
