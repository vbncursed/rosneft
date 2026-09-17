import { useUploadModels } from "../model/use-upload-models";
import { UploadModelsPage } from "./upload-models-page";

/** Maps the batch upload state machine onto the props-only page. No dialogs of its own. */
export function UploadModelsScreen() {
  const s = useUploadModels();
  return <UploadModelsPage {...s} />;
}
