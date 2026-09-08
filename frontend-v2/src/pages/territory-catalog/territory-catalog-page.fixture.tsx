import { useMemo, useState } from "react";
import { CatalogShell } from "@/widgets/catalog-shell";
import { matchesTerritory, tabCounts, type TerritoryCardModel, type TerritoryTab } from "./model/catalog";
import { TerritoryCatalogPage } from "./ui/territory-catalog-page";

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
    slug: "well-cluster-9",
    title: "Well Cluster 9",
    description: "Six wellheads with shared gathering manifold.",
    status: "ready",
    chips: [
      { label: "6 placements", tone: "plain" },
      { label: "288 MB", tone: "plain" },
    ],
    trailing: { label: "Open →", tone: "accent" },
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
];

const noop = () => {};

function Live() {
  const [tab, setTab] = useState<TerritoryTab>("all");
  const [query, setQuery] = useState("");

  const cards = useMemo(
    () => CARDS.filter((c) => matchesTerritory(c, tab, query)),
    [tab, query],
  );

  return (
    <CatalogShell>
      <TerritoryCatalogPage
        cards={cards}
        tab={tab}
        counts={tabCounts(CARDS)}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        canUpload
        canDelete
        canReplace
        onUpload={noop}
        onOpen={noop}
        onReplace={noop}
        onDelete={noop}
      />
    </CatalogShell>
  );
}

export default {
  catalog: <Live />,
  readOnly: (
    <CatalogShell>
      <TerritoryCatalogPage
        cards={CARDS}
        tab="all"
        counts={tabCounts(CARDS)}
        onTabChange={noop}
        query=""
        onQueryChange={noop}
        canUpload={false}
        canDelete={false}
        canReplace={false}
        onUpload={noop}
        onOpen={noop}
        onReplace={noop}
        onDelete={noop}
      />
    </CatalogShell>
  ),
};
