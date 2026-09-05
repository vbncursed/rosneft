import { ConversionBadge } from "./ui/conversion-badge";
import { StageList } from "./ui/stage-list";
import { trailingNote } from "./model/status";

const STATES = [
  { status: "ready" as const },
  { status: "converting" as const, progress: 42 },
  { status: "converting" as const },
  { status: "failed" as const },
];

// The upload pipeline's stages: hints on every row, and the active step
// toned accent rather than the conversion pipeline's warn default.
const UPLOAD_STAGES = [
  { label: "Chunked upload", state: "active" as const, time: "running", hint: "8 MB chunks, resumable" },
  { label: "Finalize blob", state: "pending" as const, time: "queued", hint: "content hash written" },
  { label: "Parse OBJ + MTL", state: "pending" as const, time: "~1 min", hint: "geometry and materials" },
];

export default {
  badges: (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-6">
      {STATES.map((state, i) => (
        <div key={i} className="flex items-center gap-3">
          <ConversionBadge status={state.status} />
          <span className="font-mono text-[11px] text-muted">{trailingNote(state) ?? "—"}</span>
        </div>
      ))}
    </div>
  ),
  stages: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <StageList stages={UPLOAD_STAGES} activeTone="accent" />
    </div>
  ),
};
