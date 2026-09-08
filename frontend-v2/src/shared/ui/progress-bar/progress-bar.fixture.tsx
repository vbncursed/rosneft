import { ProgressBar } from "./progress-bar";

export default {
  md: (
    <div className="flex max-w-md flex-col gap-4 rounded-card border border-line bg-panel p-6">
      <ProgressBar value={64} label="Uploading chunks" detail="64%" />
      <ProgressBar value={100} tone="ok" label="Done" />
      <ProgressBar value={38} tone="bad" label="Conversion failed" />
      <ProgressBar label="Waiting for conversion to start…" />
    </div>
  ),
  lg: (
    <div className="flex max-w-xl flex-col gap-4 p-6">
      <div className="rounded-card border border-accent-line bg-panel px-[22px] py-5">
        <ProgressBar size="lg" value={58} label="Building LOD 1" detail="58%" />
      </div>
      <div className="rounded-card border border-line bg-panel px-[22px] py-5">
        <ProgressBar size="lg" label="Waiting for a worker" detail="no progress reported" />
      </div>
    </div>
  ),
};
