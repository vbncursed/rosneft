import type { CalibrationPair } from "@/entities/site-plan";

/** The PDF page (1-based) and the point pairs tying it to the scene; PUT replaces the whole set. */
export type Calibration = { page: number; points: CalibrationPair[] };

/** A PDF attached to a territory. Served as-is from BlobStore, not converted, not anchored in the scene. */
export type Document = {
  id: number;
  territorySlug: string;
  title: string;
  sourceBlobHash: string;
  createdAt: string;
  /** Null while the plan is not aligned to the model. */
  calibration: Calibration | null;
};

export type DocumentCreate = { title: string; sourceBlobHash: string };

/** The mock's row and window print the file name; the gateway keeps a title. */
export const documentFileName = (d: Document) => d.title;
