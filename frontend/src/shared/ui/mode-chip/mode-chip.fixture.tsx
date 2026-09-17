import { ModeChip } from "./mode-chip";

export default {
  // Mock state 1 — orbit navigation, the default mode.
  accent: (
    <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-panel p-6">
      <ModeChip>orbit · drag to rotate</ModeChip>
      <ModeChip kbd="P">panorama · next</ModeChip>
    </div>
  ),
  // Mock state 3's second chip — the coarse level already on screen while the target loads.
  neutral: (
    <div className="rounded-card border border-line bg-panel p-6">
      <ModeChip tone="neutral">coarse LOD 2 shown · LOD 0 62% · 6.1 / 9.8 MB</ModeChip>
    </div>
  ),
  // Mock state 3's first chip — uppercase, wider tracking, the icon turning.
  spinning: (
    <div className="rounded-card border border-line bg-panel p-6">
      <ModeChip spinning icon="refresh">
        Loading model
      </ModeChip>
    </div>
  ),
};
