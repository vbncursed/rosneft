import { UploadProgressPanel } from "./ui/upload-progress-panel";

const noop = () => {};

export default {
  idle: (
    <div className="max-w-md p-6">
      <UploadProgressPanel
        busy={false}
        canSubmit
        submitLabel="Replace source"
        onSubmit={noop}
        onCancel={noop}
      />
    </div>
  ),
  busy: (
    <div className="max-w-md p-6">
      <UploadProgressPanel
        busy
        progress={{
          value: 41,
          header: "41% · 731 MB / 1.7 GB · ~2 min",
          stats: ["chunk 71 / 175", "8 MB chunks", "24.6 MB/s", "~4 min left"],
        }}
        canSubmit={false}
        submitLabel="Replace source"
        onSubmit={noop}
        onCancel={noop}
      />
    </div>
  ),
};
