import { ContentCard } from "./ui/content-card";
import type { ContentItem } from "./model/content-item";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug: "north-ridge-pad",
  title: "North Ridge Pad",
  status: "ready",
  size: "412 MB",
  lods: "0-2",
  updated: "31.08",
  ...over,
});

const noop = () => {};

export default (
  <div className="grid gap-3.5 p-6 md:grid-cols-3">
    <ContentCard item={item()} onReplace={noop} onDelete={noop} />
    <ContentCard
      item={item({
        slug: "terminal-yard-4",
        title: "Terminal Yard 4",
        status: "converting",
        progress: 62,
        stage: "Compressing textures…",
        size: "760 MB",
        lods: "0-1",
        updated: "27.08",
      })}
      onReplace={noop}
      onDelete={noop}
    />
    <ContentCard
      item={item({
        kind: "model",
        slug: "flare-stack",
        title: "Flare Stack",
        status: "failed",
        size: "—",
        lods: "—",
        updated: "21.08",
      })}
      onReplace={noop}
      onDelete={noop}
    />
  </div>
);
