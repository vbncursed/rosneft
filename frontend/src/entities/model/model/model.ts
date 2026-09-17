/**
 * A placeable 3D asset overlaid onto a territory at a given transform.
 * Conversion produces one artifact per LOD level; the picker greys out a model
 * whose conversion has not finished.
 */
export type Model = {
  slug: string;
  title: string;
  description?: string;
  sourceBlobHash: string;
  /** Served through /api/assets/{hash}; empty or absent means no thumbnail. */
  thumbnailBlobHash?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Distinct territories placing this model. Both the list and the Get endpoint fill it. */
  usageCount: number;
};

export const modelPath = (slug: string) => `/models/${encodeURIComponent(slug)}`;

/** The asset URL for a model's thumbnail, or null when it has none. */
export function thumbnailUrl(model: Model): string | null {
  return model.thumbnailBlobHash ? `/api/assets/${model.thumbnailBlobHash}` : null;
}
