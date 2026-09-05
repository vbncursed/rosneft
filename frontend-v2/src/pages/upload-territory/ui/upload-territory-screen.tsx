import { useUploadTerritory } from "../model/use-upload-territory";
import { UploadTerritoryPage } from "./upload-territory-page";

/** Maps the upload state machine onto the props-only page. No dialogs of its own. */
export function UploadTerritoryScreen() {
  const s = useUploadTerritory();
  return <UploadTerritoryPage {...s} />;
}
