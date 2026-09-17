import type { IconName } from "@/shared/ui/icon";
import { formatBytes } from "@/shared/lib/format-bytes";

export type UploadKind = "panorama" | "document";

/** The dialog's heading: what is being added, and what it joins. */
export const modalTitle = (kind: UploadKind, territoryTitle: string) =>
  `Add a ${kind} to ${territoryTitle}`;

/** The close button names the upload it abandons, not the window. */
export const closeTitle = (kind: UploadKind) => `Close ${kind} upload`;

export const COPY: Record<
  UploadKind,
  {
    dropLabel: string;
    dropHint: string;
    accept: string;
    placeholder: string;
    submit: string;
    glyph: IconName;
  }
> = {
  panorama: {
    dropLabel: "Drop one equirectangular photo here",
    dropHint: "JPG or PNG · 2:1 ratio · single file",
    accept: ".jpg,.jpeg,.png",
    placeholder: "e.g. Pump house, south wall",
    submit: "Upload panorama",
    glyph: "panorama",
  },
  document: {
    dropLabel: "Drop one PDF here",
    dropHint: "PDF · single file · shown as a viewport overlay",
    accept: ".pdf",
    placeholder: "e.g. Fire safety zones",
    submit: "Upload document",
    glyph: "file",
  },
};

export const CHOOSE_FILE = "Choose file";
export const TITLE_LABEL = "Title";
export const GPS_LABEL = "Place from the photo's GPS when present";
export const CANCEL = "Cancel";
export const CANCEL_UPLOAD = "Cancel upload";
export const UPLOADING = "Uploading…";
export const REPLACE = "Replace";

/**
 * The size on the file card. One decimal megabyte, as the mock prints it —
 * `formatBytes` rounds below a gigabyte, and "25 MB" hides the difference
 * between two captures. Below a megabyte a decimal MB reads "0.0", so the
 * app's own wording takes over there.
 */
export const fileSize = (bytes: number) =>
  bytes < 1_048_576 ? formatBytes(bytes) : `${(bytes / 1_048_576).toFixed(1)} MB`;
