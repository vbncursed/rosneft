import { useState } from "react";
import { ContentRow } from "./ui/content-row";
import type { ContentItem } from "./model/content-item";

const item = (
  slug: string,
  title: string,
  over: Partial<ContentItem> = {},
): ContentItem => ({
  kind: "territory",
  slug,
  title,
  status: "ready",
  meta: `${slug} · upd. 31.08 · 3 placements`,
  lods: "LOD 0-2",
  size: "412 MB",
  ...over,
});

const ITEMS = [
  item("terminal-yard-4", "Terminal Yard 4", {
    status: "converting",
    progress: 62,
    stage: "textures",
    meta: "terminal-yard-4 · job 8f21 · mesh-worker-2",
    lods: "LOD 0-1",
    size: "760 MB",
  }),
  item("north-ridge-pad", "North Ridge Pad"),
  item("flare-stack", "Flare Stack", {
    kind: "model",
    status: "failed",
    meta: "flare-stack · OBJ parse error at line 84120",
    lods: "—",
    size: "—",
  }),
  item("pump-jack-unit", "Pump Jack Unit", {
    kind: "model",
    meta: "pump-jack-unit · used in 6 territories",
    size: "38 MB",
  }),
];

function Live() {
  const [selected, setSelected] = useState("terminal-yard-4");
  return (
    <div className="flex max-w-3xl flex-col gap-2.5 p-6">
      {ITEMS.map((entry) => (
        <ContentRow
          key={entry.slug}
          item={entry}
          selected={entry.slug === selected}
          onSelect={() => setSelected(entry.slug)}
        />
      ))}
    </div>
  );
}

export default <Live />;
