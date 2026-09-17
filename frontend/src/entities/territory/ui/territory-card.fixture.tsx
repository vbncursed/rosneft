import type { TerritoryCardModel } from "../model/territory-card";
import { TerritoryCard } from "./territory-card";

const CARDS: TerritoryCardModel[] = [
  {
    slug: "north-ridge-pad",
    title: "North Ridge Pad",
    description: "Wellhead cluster and gathering lines across the northern block.",
    status: "ready",
    chips: [
      { label: "3 placements", tone: "plain" },
      { label: "412 MB", tone: "plain" },
      { label: "panorama", tone: "ok" },
    ],
    trailing: { label: "Open →", tone: "accent" },
    panorama: true,
  },
  {
    slug: "terminal-yard-4",
    title: "Terminal Yard 4",
    status: "converting",
    chips: [
      { label: "LOD 0-1", tone: "warn" },
      { label: "760 MB", tone: "plain" },
    ],
    progress: { value: 62, stage: "Compressing textures" },
    trailing: { label: "converting", tone: "muted" },
    panorama: false,
  },
  {
    slug: "pipe-rack-b7",
    title: "Pipe Rack B7",
    description: "Source archive rejected — the OBJ references textures by absolute path.",
    status: "failed",
    chips: [
      { label: "—", tone: "plain" },
      { label: "—", tone: "plain" },
    ],
    trailing: { label: "unavailable", tone: "muted" },
    panorama: false,
  },
  {
    slug: "draft-site-01",
    title: "Draft Site 01",
    description: "Uploaded, waiting for a conversion slot.",
    status: "pending",
    chips: [
      { label: "0 placements", tone: "plain" },
      { label: "—", tone: "plain" },
    ],
    trailing: { label: "pending", tone: "muted" },
    panorama: false,
  },
];

export default (
  <div className="grid gap-3.5 p-6 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
    {CARDS.map((card) => (
      <TerritoryCard key={card.slug} card={card} href={`/territories/${card.slug}`} onOpen={() => {}} />
    ))}
  </div>
);
