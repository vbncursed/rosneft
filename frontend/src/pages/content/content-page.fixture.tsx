import { useMemo, useState } from "react";
import {
  matchesFilters,
  matchesText,
  pipelineCounts,
  type ContentItem,
} from "@/entities/content";
import { parseFilters, freeText } from "@/features/audit-filter";
import { Icon } from "@/shared/ui/icon";
import { Menu } from "@/shared/ui/menu";
import { ConsoleLayout } from "@/widgets/console-layout";
import type { ContentGroup } from "@/widgets/content-groups";
import { ContentPage } from "./ui/content-page";

const noop = () => {};

const make = (
  kind: ContentItem["kind"],
  slug: string,
  title: string,
  over: Partial<ContentItem> = {},
): ContentItem => ({
  kind,
  slug,
  title,
  status: "ready",
  meta: `${slug} · upd. 31.08`,
  lods: "LOD 0-2",
  size: "412 MB",
  ...over,
});

const ITEMS: ContentItem[] = [
  make("territory", "terminal-yard-4", "Terminal Yard 4", {
    status: "converting", progress: 62, stage: "textures",
    meta: "terminal-yard-4 · job 8f21 · mesh-worker-2", lods: "LOD 0-1", size: "760 MB",
  }),
  make("model", "pipe-rack-b7", "Pipe Rack B7", {
    status: "converting", progress: 18, stage: "parsing",
    meta: "pipe-rack-b7 · job 8f22 · queued 11 min", lods: "—", size: "1.1 GB",
  }),
  make("model", "flare-stack", "Flare Stack", {
    status: "failed", meta: "flare-stack · OBJ parse error at line 84120", lods: "—", size: "—",
  }),
  make("territory", "north-ridge-pad", "North Ridge Pad", { meta: "north-ridge-pad · upd. 31.08 · 3 placements" }),
  make("territory", "refinery-block-c", "Refinery Block C", { meta: "refinery-block-c · upd. 29.08 · 14 placements", size: "1.2 GB" }),
  make("territory", "tank-farm-south", "Tank Farm South", { meta: "tank-farm-south · upd. 26.08 · 8 placements", size: "689 MB" }),
  make("model", "pump-jack-unit", "Pump Jack Unit", { meta: "pump-jack-unit · used in 6 territories", size: "38 MB" }),
  make("model", "storage-tank-500", "Storage Tank 500", { meta: "storage-tank-500 · used in 4 territories", size: "96 MB" }),
  make("model", "valve-assembly", "Valve Assembly", { meta: "valve-assembly · used in 2 territories", lods: "LOD 0-1", size: "12 MB" }),
];

const STATS = [
  { label: "Territories", value: "12", hint: "3 shared with guests" },
  { label: "Models", value: "31", hint: "placeable assets" },
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

const STAGES = [
  { label: "Parsing OBJ", state: "done" as const, time: "1m 12s" },
  { label: "Building LOD 0-1", state: "done" as const, time: "3m 04s" },
  { label: "Compressing textures", state: "active" as const, time: "running" },
  { label: "Building LOD 2", state: "pending" as const, time: "queued" },
];

function group(items: ContentItem[]): ContentGroup[] {
  const attention = items.filter((i) => i.status !== "ready");
  const territories = items.filter((i) => i.status === "ready" && i.kind === "territory");
  const models = items.filter((i) => i.status === "ready" && i.kind === "model");
  return [
    { key: "attention", label: "Needs attention", note: `${attention.length} items`, items: attention },
    { key: "territories", label: "Territories", note: `${territories.length} items`, items: territories },
    { key: "models", label: "Models", note: `${models.length} items`, items: models },
  ];
}

function Live({ initialSelected }: { initialSelected: string | null }) {
  const [query, setQuery] = useState("kind:territory");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSelected);

  // The route would filter server-side; here the pure helpers do it, which is
  // also what their own specs cover.
  const visible = useMemo(() => {
    const filters = parseFilters(query);
    const text = freeText(query);
    return ITEMS.filter((i) => matchesFilters(i, filters) && matchesText(i, text));
  }, [query]);

  const counts = pipelineCounts(ITEMS);
  const selected = ITEMS.find((i) => i.slug === selectedSlug) ?? null;

  return (
    <ConsoleLayout
      items={NAV}
      active="content"
      backHref="#"
      viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
    >
      <ContentPage
        groups={group(visible)}
        pipeline={{
          label: "Pipeline state",
          detail: `${counts.ready} / ${ITEMS.length} ready`,
          segments: [
            { tone: "ok", value: counts.ready, label: "ready" },
            { tone: "warn", value: counts.converting, label: "converting" },
            { tone: "bad", value: counts.failed, label: "failed" },
          ],
        }}
        stats={STATS}
        query={query}
        onQueryChange={setQuery}
        selectedSlug={selectedSlug}
        onSelect={(i) => setSelectedSlug(i.slug)}
        onCloseInspector={() => setSelectedSlug(null)}
        inspected={
          selected && {
            item: selected,
            conversionNote: selected.status === "converting" ? "62% · ~4 min" : undefined,
            stages: selected.status === "converting" ? STAGES : undefined,
            details: [
              { label: "source", value: `${selected.slug}.obj · 2.4 GB` },
              { label: "artifacts", value: `GLB + KTX2 · ${selected.size}` },
              { label: "lods", value: selected.lods },
              { label: "job", value: "8f21 · mesh-worker-2" },
            ],
          }
        }
        renderRowActions={(i) => (
          <Menu
            triggerLabel={`Actions for ${i.title}`}
            trigger={<Icon name="kebab" size={15} />}
            items={[
              { label: "Replace source", onSelect: noop },
              { label: "Open in viewer", onSelect: noop, tone: "accent" },
              { label: "Delete", onSelect: noop, tone: "bad" },
            ]}
          />
        )}
        onUploadTerritory={noop}
        onUploadModel={noop}
        onReplaceSource={noop}
        onOpenInViewer={noop}
        onDelete={noop}
        onCancelJob={noop}
      />
    </ConsoleLayout>
  );
}

export default {
  converting: <Live initialSelected="terminal-yard-4" />,
  catalogOnly: <Live initialSelected={null} />,
};
