import { ToolRail, type ToolRailItem } from "./tool-rail";

const BASE_TOOLS: Omit<ToolRailItem, "state">[] = [
  { key: "reset", glyph: "↺", name: "Reset camera" },
  { key: "measure", glyph: "↔", name: "Measure (M)" },
  { key: "add", glyph: "＋", name: "Add objects" },
  { key: "panoramas", glyph: "◎", name: "Panoramas" },
  { key: "documents", glyph: "▤", name: "Documents" },
  { key: "tour", glyph: "▶", name: "Replay guided tour" },
];

const withStates = (states: Record<string, ToolRailItem["state"]>): ToolRailItem[] =>
  BASE_TOOLS.map((tool) => ({ ...tool, state: states[tool.key] ?? "idle", onClick: () => {} }));

export default {
  // Mock state 1 — orbit mode, Reset camera pressed, everything else idle.
  default: (
    <div className="rounded-card border border-line bg-panel p-6">
      <ToolRail label="Viewer tools" tools={withStates({ reset: "active" })} />
    </div>
  ),
  // Mock state 3 — the scene is still loading, so only Reset camera can be used.
  loading: (
    <div className="rounded-card border border-line bg-panel p-6">
      <ToolRail
        label="Viewer tools"
        tools={withStates({
          reset: "active",
          measure: "inert",
          add: "inert",
          panoramas: "inert",
          documents: "inert",
          tour: "inert",
        })}
      />
    </div>
  ),
  // Mock state 6 — no geometry loaded; only Panoramas and Documents stay clickable.
  unavailable: (
    <div className="rounded-card border border-line bg-panel p-6">
      <ToolRail
        label="Viewer tools"
        tools={withStates({
          reset: "inert",
          measure: "inert",
          add: "inert",
          panoramas: "idle",
          documents: "idle",
          tour: "inert",
        })}
      />
    </div>
  ),
};
