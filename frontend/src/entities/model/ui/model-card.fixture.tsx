import type { ModelCardModel } from "../model/model-card";
import { ModelCard } from "./model-card";

// A tiny inline placeholder — no network fetch inside a Cosmos fixture.
const PLACEHOLDER_THUMB =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200'%3E%3Crect width='100%25' height='100%25' fill='%23888'/%3E%3C/svg%3E";

const CARDS: ModelCardModel[] = [
  {
    slug: "pump-jack-unit",
    title: "Pump Jack Unit",
    status: "ready",
    thumbnailUrl: PLACEHOLDER_THUMB,
    usageCount: 6,
    size: "38 MB",
    lods: "LOD 0-2",
    trailing: { label: "in 6 territories", tone: "accent" },
  },
  {
    slug: "ladder-platform",
    title: "Ladder Platform",
    status: "ready",
    thumbnailUrl: null,
    usageCount: 0,
    size: "8 MB",
    lods: "LOD 0-2",
    trailing: { label: "unused", tone: "muted" },
  },
  {
    slug: "separator-vessel",
    title: "Separator Vessel",
    status: "converting",
    thumbnailUrl: null,
    usageCount: 0,
    size: "182 MB",
    lods: "LOD 0",
    trailing: { label: "queued", tone: "warn" },
  },
];

export default (
  <div className="grid gap-3 p-6 [grid-template-columns:repeat(auto-fill,minmax(216px,1fr))]">
    {CARDS.map((card) => (
      <ModelCard key={card.slug} card={card} href={`/models/${card.slug}`} onOpen={() => {}} meta={card.size} />
    ))}
  </div>
);
