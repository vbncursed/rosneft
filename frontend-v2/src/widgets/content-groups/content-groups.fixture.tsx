import { useState } from "react";
import { ContentGroups, type ContentGroup } from "./ui/content-groups";
import type { ContentItem } from "@/entities/content";

const item = (slug: string, title: string, over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug,
  title,
  status: "ready",
  meta: `${slug} · upd. 31.08`,
  lods: "LOD 0-2",
  size: "412 MB",
  ...over,
});

const GROUPS: ContentGroup[] = [
  {
    key: "attention",
    label: "Needs attention",
    note: "3 items",
    items: [
      item("terminal-yard-4", "Terminal Yard 4", { status: "converting", progress: 62, stage: "textures", lods: "LOD 0-1", size: "760 MB" }),
      item("pipe-rack-b7", "Pipe Rack B7", { kind: "model", status: "converting", progress: 18, stage: "parsing", lods: "—", size: "1.1 GB" }),
      item("flare-stack", "Flare Stack", { kind: "model", status: "failed", lods: "—", size: "—" }),
    ],
  },
  {
    key: "territories",
    label: "Territories",
    note: "12 items · 11 ready",
    items: [item("north-ridge-pad", "North Ridge Pad"), item("refinery-block-c", "Refinery Block C", { size: "1.2 GB" })],
  },
];

function Live() {
  const [selected, setSelected] = useState<string | null>("terminal-yard-4");
  return (
    <ContentGroups
      groups={GROUPS}
      selectedSlug={selected}
      onSelect={(i) => setSelected(i.slug)}
      onDropZoneClick={() => {}}
    />
  );
}

export default {
  grouped: (
    <div className="max-w-3xl p-6">
      <Live />
    </div>
  ),
  filteredToNothing: (
    <div className="max-w-3xl p-6">
      <ContentGroups groups={[{ key: "models", label: "Models", items: [] }]} onDropZoneClick={() => {}} />
    </div>
  ),
};
