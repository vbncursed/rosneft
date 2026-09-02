import { ConversionQueue } from "./ui/conversion-queue";
import type { ConversionJob } from "@/entities/conversion";

const JOBS: ConversionJob[] = [
  { id: "1", slug: "terminal-yard-4", state: "running", progress: 62, stage: "Compressing textures and geometry…", eta: "~4 min" },
  { id: "2", slug: "pipe-rack-b7", state: "running", progress: 18, stage: "Parsing OBJ…", eta: "~11 min" },
  { id: "3", slug: "waiting-room", state: "queued", stage: "Waiting for a worker…", eta: "—" },
  { id: "4", slug: "flare-stack", state: "failed", progress: 18, stage: "OBJ parse error at line 84120", eta: "—" },
];

export default {
  busy: (
    <div className="max-w-3xl p-6">
      <ConversionQueue jobs={JOBS} />
    </div>
  ),
  idle: (
    <div className="max-w-3xl p-6">
      <ConversionQueue jobs={[]} />
    </div>
  ),
};
