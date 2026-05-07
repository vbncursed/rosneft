// Territory is a parent scene the viewer renders as the canvas. Models
// are placed onto a territory via Placement records.
export interface Territory {
  slug: string;
  title: string;
  description?: string;
  sourceBlobHash: string;
  createdAt?: string;
  updatedAt?: string;
}
