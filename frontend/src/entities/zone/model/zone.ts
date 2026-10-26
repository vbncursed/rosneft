import type { Vec3 } from "@/entities/placement";
import type { ModelTag } from "@/entities/model-tag";

/** A named rectangle on a territory; corners are in scene space, in drawing order. */
export type Zone = {
  id: number;
  title: string;
  corners: [Vec3, Vec3, Vec3, Vec3];
  tags: ModelTag[];
  /** Null when the drawing's scale is unknown. */
  drawingWidthM: number | null;
  drawingHeightM: number | null;
  createdAt: string;
  updatedAt: string;
};
