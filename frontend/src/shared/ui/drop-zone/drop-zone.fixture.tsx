import { DropZone } from "./drop-zone";

export default (
  <div className="flex max-w-lg flex-col gap-4 p-6">
    <DropZone
      label="Drop ZIP archives here"
      hint="Or pick several at once — each becomes its own model."
      buttonLabel="Choose files"
      accept=".zip,application/zip"
      multiple
      onFiles={() => {}}
    />
    <DropZone
      label="Drop a ZIP here"
      hint="Or pick one"
      buttonLabel="Choose file"
      accept=".zip,application/zip"
      disabled
      onFiles={() => {}}
    />
  </div>
);
