// BatchRowStatus tracks one row's lifecycle in a batch upload. Each row
// progresses idle → uploading → creating → done, or stops at failed.
export type BatchRowStatus =
  | "idle"
  | "uploading"
  | "finalizing"
  | "creating"
  | "done"
  | "failed";

export interface BatchRow {
  id: string;
  file: File;
  title: string;
  status: BatchRowStatus;
  progress: number; // 0..1, only meaningful while uploading
  error?: string;
  // Optional thumbnail image (models only). Uploaded as its own blob before
  // the model is created; the resulting hash rides along in the create body.
  thumbnail?: File;
}

// deriveTitle keeps the original casing and word breaks so a filename
// like `MyBuilding-v2.zip` becomes a readable `MyBuilding-v2`.
export function deriveTitle(filename: string): string {
  return filename.replace(/\.zip$/i, "").trim();
}
