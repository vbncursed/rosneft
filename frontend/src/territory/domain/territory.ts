// Territory is a parent scene the viewer renders as the canvas. Models
// are placed onto a territory via Placement records.
export interface Territory {
  slug: string;
  title: string;
  description?: string;
  // Optional link to an externally-hosted panorama tour. The viewer shows
  // a button that opens it in a new tab; absent/empty means no button.
  externalPanoramaUrl?: string;
  sourceBlobHash: string;
  createdAt?: string;
  updatedAt?: string;
}
