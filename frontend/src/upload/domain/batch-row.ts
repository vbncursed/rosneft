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
  slug: string;
  title: string;
  status: BatchRowStatus;
  progress: number; // 0..1, only meaningful while uploading
  error?: string;
}

// deriveSlug strips the .zip extension and sanitises the rest into a
// lowercase a-z0-9- string the catalog accepts. Whitespace and
// underscores become hyphens; everything else is dropped. Adjacent
// hyphens collapse, leading/trailing hyphens get trimmed.
export function deriveSlug(filename: string): string {
  const base = filename.replace(/\.zip$/i, "");
  const cleaned = base
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned;
}

// deriveTitle keeps the original casing and word breaks so a filename
// like `MyBuilding-v2.zip` becomes a readable `MyBuilding-v2`.
export function deriveTitle(filename: string): string {
  return filename.replace(/\.zip$/i, "").trim();
}
