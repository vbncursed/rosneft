import { ProgressBar } from "./progress-bar";

export default (
  <div className="flex max-w-md flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <ProgressBar value={64} label="Uploading chunks" detail="64%" />
    <ProgressBar value={100} tone="ok" label="Done" />
    <ProgressBar value={38} tone="bad" label="Conversion failed" />
    <ProgressBar label="Waiting for conversion to start…" />
  </div>
);
