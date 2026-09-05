import { ConversionBadge } from "./ui/conversion-badge";
import { trailingNote } from "./model/status";

const STATES = [
  { status: "ready" as const },
  { status: "converting" as const, progress: 42 },
  { status: "converting" as const },
  { status: "failed" as const },
];

export default (
  <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-6">
    {STATES.map((state, i) => (
      <div key={i} className="flex items-center gap-3">
        <ConversionBadge status={state.status} />
        <span className="font-mono text-[11px] text-muted">{trailingNote(state) ?? "—"}</span>
      </div>
    ))}
  </div>
);
