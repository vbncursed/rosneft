// Document is a PDF attached to a territory. No scene position, no slug —
// identified by id, its bytes served via /api/assets/{sourceBlobHash}.
export interface Document {
  id: number;
  territorySlug: string;
  title: string;
  sourceBlobHash: string;
  createdAt: string;
}

// DocumentCreate is the POST body. The id and createdAt are server-assigned.
export interface DocumentCreate {
  title: string;
  sourceBlobHash: string;
}
