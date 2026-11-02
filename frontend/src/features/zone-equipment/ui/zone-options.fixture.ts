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
