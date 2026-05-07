// UploadSession is the client-side view of an in-progress chunked upload.
// Mirrors the gateway's UploadSession shape but trims server-only fields.
export interface UploadSession {
  id: string;
  size: number;
  offset: number;
  contentType?: string;
}

// FinalizedBlob is the result of POST /api/uploads/{id}/finalize — a
// content-addressed hash that callers attach to a Territory or Model
// via createTerritory / createModel.
export interface FinalizedBlob {
  hash: string;
  size: number;
}
