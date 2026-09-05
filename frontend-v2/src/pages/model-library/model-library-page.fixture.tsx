import { useMemo, useState } from "react";
import { CatalogShell } from "@/widgets/catalog-shell";
import { matchesModel, tabCounts, type ModelCardModel, type ModelTab } from "./model/catalog";
import { ModelLibraryPage } from "./ui/model-library-page";

// A tiny inline placeholder — no network fetch inside a Cosmos fixture.
const THUMB =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200'%3E%3Crect width='100%25' height='100%25' fill='%23888'/%3E%3C/svg%3E";

const CARDS: ModelCardModel[] = [
  {
    slug: "pump-jack-unit",
    title: "Pump Jack Unit",
    status: "ready",
    thumbnailUrl: THUMB,
    usageCount: 6,
    chips: [{ label: "38 MB", tone: "plain" }],
    lods: "LOD 0-2",
    trailing: { label: "in 6 territories", tone: "accent" },
  },
  {
    slug: "storage-tank-500",
    title: "Storage Tank 500",
    status: "ready",
    thumbnailUrl: THUMB,
    usageCount: 4,
    chips: [{ label: "96 MB", tone: "plain" }],
    lods: "LOD 0-2",
    trailing: { label: "in 4 territories", tone: "accent" },
  },
  {
    slug: "valve-assembly",
    title: "Valve Assembly",
    status: "ready",
    thumbnailUrl: THUMB,
    usageCount: 2,
    chips: [{ label: "12 MB", tone: "plain" }],
    lods: "LOD 0-2",
    trailing: { label: "in 2 territories", tone: "accent" },
  },
  {
    slug: "flare-stack",
    title: "Flare Stack",
    status: "failed",
    thumbnailUrl: null,
    usageCount: 0,
    chips: [{ label: "—", tone: "plain" }],
    lods: "—",
    trailing: { label: "unavailable", tone: "bad" },
  },
  {
    slug: "pipe-rack-segment",
    title: "Pipe Rack Segment",
    status: "ready",
    thumbnailUrl: THUMB,
    usageCount: 9,
    chips: [{ label: "26 MB", tone: "plain" }],
    lods: "LOD 0-2",
    trailing: { label: "in 9 territories", tone: "accent" },
  },
  {
    slug: "control-cabin",
    title: "Control Cabin",
    status: "ready",
    thumbnailUrl: null,
    usageCount: 3,
    chips: [{ label: "54 MB", tone: "plain" }],
    lods: "LOD 0-2",
    trailing: { label: "in 3 territories", tone: "accent" },
  },
  {
    slug: "separator-vessel",
    title: "Separator Vessel",
    status: "converting",
    thumbnailUrl: null,
    usageCount: 0,
    chips: [{ label: "182 MB", tone: "plain" }],
    lods: "LOD 0",
    trailing: { label: "queued", tone: "warn" },
  },
  {
    slug: "ladder-platform",
    title: "Ladder Platform",
    status: "ready",
    thumbnailUrl: null,
    usageCount: 0,
    chips: [{ label: "8 MB", tone: "plain" }],
    lods: "LOD 0-2",
    trailing: { label: "unused", tone: "muted" },
  },
];

const noop = () => {};

function Live() {
  const [tab, setTab] = useState<ModelTab>("all");
  const [query, setQuery] = useState("");

  const cards = useMemo(() => CARDS.filter((c) => matchesModel(c, tab, query)), [tab, query]);

  return (
    <CatalogShell>
      <ModelLibraryPage
        cards={cards}
        tab={tab}
        counts={tabCounts(CARDS)}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        canUpload
        canDelete
        onUpload={noop}
        onOpen={noop}
        onDelete={noop}
      />
    </CatalogShell>
  );
}

export default {
  library: <Live />,
  readOnly: (
    <CatalogShell>
      <ModelLibraryPage
        cards={CARDS}
        tab="all"
        counts={tabCounts(CARDS)}
        onTabChange={noop}
        query=""
        onQueryChange={noop}
        canUpload={false}
        canDelete={false}
        onUpload={noop}
        onOpen={noop}
        onDelete={noop}
      />
    </CatalogShell>
  ),
};
