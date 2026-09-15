import { useState } from "react";
import {
  createPanorama,
  exifScenePosition,
  isEquirectImageSignature,
  type Panorama,
  type ScenePositionResult,
  type SourceBbox,
} from "@/entities/panorama";
import { useFileUpload } from "@/entities/upload";
import { notify } from "@/shared/lib/notify";

export type PanoramaUploadParams = {
  slug: string;
  /** The territory's source bounding box — without it a GPS fix maps nowhere. */
  sourceBbox: SourceBbox | null;
  onCreated: (panorama: Panorama) => void;
};

const REFUSAL = "Please choose an equirectangular JPG or PNG image.";
const NO_GPS: ScenePositionResult = { position: null, reason: "no-gps" };

/** What the reader is told once the row exists — the anchor is the subject, not the upload. */
const placedNote = (placed: ScenePositionResult) =>
  placed.position
    ? "Panorama placed from GPS"
    : placed.reason === "outside"
      ? "Photo location doesn't match this territory — set position manually"
      : "Panorama uploaded — set its position manually";

/**
 * The panorama upload: sniff, stream, read the photo's own GPS, create the row
 * at the position it implies. The EXIF read happens after the bytes are in —
 * the file is already in hand, and doing it first would delay the progress the
 * reader is watching — which is why the upload line reads "Reading EXIF".
 */
export function usePanoramaUpload({ slug, sourceBbox, onCreated }: PanoramaUploadParams) {
  const upload = useFileUpload({
    sniff: isEquirectImageSignature,
    refusal: REFUSAL,
    uploadingLabel: (percent) => `Reading EXIF · ${percent} %`,
  });
  const [title, setTitle] = useState("");
  const [useGps, setUseGps] = useState(true);

  const trimmed = title.trim();
  const canSubmit = trimmed !== "" && upload.state.stage === "picked";

  const submit = async () => {
    if (!canSubmit) return;
    await upload.run(async (blob, file) => {
      const placed = useGps ? await exifScenePosition(file, sourceBbox) : NO_GPS;
      const panorama = await createPanorama(slug, {
        title: trimmed,
        sourceBlobHash: blob.hash,
        // The gateway anchors an absent position at the origin; sending null
        // is not the same as not sending it.
        ...(placed.position ? { position: placed.position } : {}),
        yawOffset: 0,
      });
      notify.success(placedNote(placed));
      // The form is emptied here, not on the dialog's close: this hook lives on
      // the page (it is the page that takes onCreated), so a second upload in
      // the same session would otherwise open over the first one's title and
      // light up its primary the instant a file landed. A refusal keeps the
      // typed values, which is why the reset is inside the successful path.
      setTitle("");
      setUseGps(true);
      onCreated(panorama);
    });
  };

  return {
    upload: upload.state,
    title,
    setTitle,
    useGps,
    setUseGps,
    // The modal's DropZone hands over a list; only the first file is a panorama.
    pick: (files: File[]) => (files[0] ? upload.pick(files[0]) : Promise.resolve()),
    clear: upload.clear,
    cancel: upload.cancel,
    submit,
    canSubmit,
  };
}
