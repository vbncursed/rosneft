// Model is a placeable 3D asset overlaid onto a territory at a specific
// transform. Conversion produces one Artifact per LOD level; the picker
// uses the LOD chain to grey out unconverted models.
export interface Model {
  slug: string;
  title: string;
  description?: string;
  sourceBlobHash: string;
  // Optional thumbnail image blob hash ('' / undefined = none); served via
  // /api/assets/{hash}.
  thumbnailBlobHash?: string;
  createdAt?: string;
  updatedAt?: string;
}
