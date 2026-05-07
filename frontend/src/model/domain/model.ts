// Model is a placeable 3D asset overlaid onto a territory at a specific
// transform. Conversion produces one Artifact per LOD level; the picker
// uses the LOD chain to grey out unconverted models.
export interface Model {
  slug: string;
  title: string;
  description?: string;
  sourceBlobHash: string;
  createdAt?: string;
  updatedAt?: string;
}
