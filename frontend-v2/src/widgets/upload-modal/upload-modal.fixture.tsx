import type { FileUploadState } from "@/entities/upload";
import { UploadModal, type UploadModalProps } from "./ui/upload-modal";

// A File the browser never produced: the card reads a name and a size, and a
// fixture cannot pick a real one from disk.
const photo = { name: "pump-house-south.jpg", size: 25_795_788 } as unknown as File;

const noop = () => {};

const base: UploadModalProps = {
  open: true,
  kind: "panorama",
  territoryTitle: "Refinery Block C",
  upload: { stage: "idle", file: null },
  title: "",
  onTitle: noop,
  gps: { checked: true, onChange: noop },
  canSubmit: false,
  onPick: noop,
  onClear: noop,
  onSubmit: noop,
  onCancelUpload: noop,
  onClose: noop,
};

const uploading: FileUploadState = {
  stage: "uploading",
  file: photo,
  percent: 38,
  label: "Reading EXIF · 38 %",
};

export default {
  "panorama-idle": <UploadModal {...base} />,
  "panorama-picked": (
    <UploadModal
      {...base}
      title="Pump house, south wall"
      canSubmit
      upload={{ stage: "picked", file: photo }}
    />
  ),
  "panorama-uploading": (
    <UploadModal {...base} title="Pump house, south wall" upload={uploading} />
  ),
  "panorama-creating": (
    <UploadModal
      {...base}
      title="Pump house, south wall"
      upload={{ stage: "creating", file: photo }}
    />
  ),
  "document-idle": (
    <UploadModal {...base} kind="document" gps={undefined} />
  ),
  refused: (
    <UploadModal
      {...base}
      upload={{
        stage: "refused",
        file: null,
        reason: "Please choose an equirectangular JPG or PNG image.",
      }}
    />
  ),
};
