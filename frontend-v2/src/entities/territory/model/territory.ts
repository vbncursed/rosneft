/**
 * A parent scene the viewer renders as the canvas. Models are placed onto a
 * territory through Placement records.
 */
export type Territory = {
  slug: string;
  title: string;
  description?: string;
  /** An externally hosted panorama tour; absent or empty means no button. */
  externalPanoramaUrl?: string;
  sourceBlobHash: string;
  createdAt?: string;
  updatedAt?: string;
};

export const territoryPath = (slug: string) => `/territories/${slug}`;
