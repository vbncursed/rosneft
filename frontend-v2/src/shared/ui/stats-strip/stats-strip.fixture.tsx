import { StatsStrip } from "./stats-strip";

export default {
  // Mock state 1 — a settled scene.
  neutral: (
    <div className="rounded-card border border-line bg-panel p-6">
      <StatsStrip items={["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "LOD 1 active"]} />
    </div>
  ),
  // Mock state 3 — the last item names what is loading, in accent.
  accentLast: (
    <div className="rounded-card border border-line bg-panel p-6">
      <StatsStrip accentLast items={["36.0 × 24.0 × 8.5 m", "1 284 210 vertices", "LOD 0 loading"]} />
    </div>
  ),
  // Mock state 6 — no geometry loaded.
  bad: (
    <div className="rounded-card border border-line bg-panel p-6">
      <StatsStrip tone="bad" items={["no geometry loaded", "vertices —"]} />
    </div>
  ),
};
