/** A PDF attached to a territory. Served as-is from BlobStore, not converted, not anchored in the scene. */
export type Document = {
  id: number;
  territorySlug: string;
  title: string;
  sourceBlobHash: string;
  createdAt: string;
};

export type DocumentCreate = { title: string; sourceBlobHash: string };

/** The mock's row and window print the file name; the gateway keeps a title. */
export const documentFileName = (d: Document) => d.title;
