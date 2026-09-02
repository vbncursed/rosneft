import { useMemo, useState } from "react";
import { countByKind, filterContent, type ContentItem, type ContentTab } from "@/entities/content";
import type { ConversionJob } from "@/entities/conversion";
import { ConsoleLayout } from "@/widgets/console-layout";
import { ContentPage } from "./ui/content-page";

const noop = () => {};

const ITEMS: ContentItem[] = [
  { kind: "territory", slug: "north-ridge-pad", title: "North Ridge Pad", status: "ready", size: "412 MB", lods: "0-2", updated: "31.08" },
  { kind: "territory", slug: "refinery-block-c", title: "Refinery Block C", status: "ready", size: "1.2 GB", lods: "0-2", updated: "29.08" },
  {
    kind: "territory", slug: "terminal-yard-4", title: "Terminal Yard 4", status: "converting",
    size: "760 MB", lods: "0-1", updated: "27.08", progress: 62, stage: "Compressing textures…",
  },
  { kind: "model", slug: "pump-jack-unit", title: "Pump Jack Unit", status: "ready", size: "38 MB", lods: "0-2", updated: "24.08" },
  { kind: "model", slug: "storage-tank-500", title: "Storage Tank 500", status: "ready", size: "96 MB", lods: "0-2", updated: "22.08" },
  { kind: "model", slug: "flare-stack", title: "Flare Stack", status: "failed", size: "—", lods: "—", updated: "21.08" },
];

const JOBS: ConversionJob[] = [
  { id: "1", slug: "terminal-yard-4", state: "running", progress: 62, stage: "Compressing textures and geometry…", eta: "~4 min" },
  { id: "2", slug: "pipe-rack-b7", state: "running", progress: 18, stage: "Parsing OBJ…", eta: "~11 min" },
  { id: "3", slug: "flare-stack", state: "failed", progress: 18, stage: "OBJ parse error at line 84120", eta: "—" },
];

const STATS = [
  { label: "Territories", value: "12", hint: "3 shared with guests" },
  { label: "Models", value: "31", hint: "placeable assets" },
  { label: "Converting", value: "2", hint: "in flight · 1 failed", tone: "bad" as const },
  { label: "Storage", value: "184 GB", hint: "GLB + KTX2 artifacts", tone: "accent" as const },
];

const NAV = [
  { key: "users", label: "Users", href: "#" },
  { key: "roles", label: "Roles & Permissions", href: "#" },
  { key: "content", label: "Content", href: "#" },
  { key: "access", label: "Territory access", href: "#" },
  { key: "audit", label: "Audit journal", href: "#" },
  { key: "metrics", label: "Metrics", href: "#" },
];

function Live({ initialQuery = "" }: { initialQuery?: string }) {
  const [tab, setTab] = useState<ContentTab>("all");
  const [query, setQuery] = useState(initialQuery);

  // The route would filter server-side; here the pure helper does it, which is
  // also what its own spec covers.
  const items = useMemo(() => filterContent(ITEMS, tab, query), [tab, query]);

  return (
    <ConsoleLayout
      items={NAV}
      active="content"
      backHref="#"
      viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
    >
      <ContentPage
        items={items}
        counts={countByKind(ITEMS)}
        stats={STATS}
        jobs={JOBS}
        tab={tab}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        onUploadTerritory={noop}
        onUploadModel={noop}
        onReplace={noop}
        onDelete={noop}
      />
    </ConsoleLayout>
  );
}

export default {
  catalog: <Live />,
  nothingMatches: <Live initialQuery="nonexistent" />,
};
