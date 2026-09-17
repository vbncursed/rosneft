import { useMemo, useState } from "react";
import type { AccessGrant, TerritoryAccess, Visibility } from "@/entities/territory";
import { parseFilters } from "@/features/audit-filter";
import { ConsoleLayout } from "@/widgets/console-layout";
import type { AccessGroup } from "@/widgets/access-groups";
import { TerritoryAccessPage } from "./ui/territory-access-page";

const noop = () => {};

const t = (
  slug: string,
  title: string,
  visibility: Visibility,
  over: Partial<TerritoryAccess> = {},
): TerritoryAccess => ({
  slug,
  title,
  visibility,
  meta: `${slug} · 14 placements · upd. 29.08`,
  faces: ["a.ivanova", "m.orlova"],
  peopleLabel: "4 people",
  ...over,
});

const TERRITORIES: TerritoryAccess[] = [
  t("refinery-block-c", "Refinery Block C", "assigned", { faces: ["a.ivanova", "m.orlova", "k.petrov"] }),
  t("terminal-yard-4", "Terminal Yard 4", "assigned", { meta: "terminal-yard-4 · converting · job 8f21", faces: ["d.smirnov"], peopleLabel: "1 person" }),
  t("well-cluster-9", "Well Cluster 9", "assigned", { meta: "well-cluster-9 · 6 placements · upd. 25.08", faces: ["d.smirnov", "i.lebedev"], peopleLabel: "2 people" }),
  t("north-ridge-pad", "North Ridge Pad", "company", { meta: "north-ridge-pad · 3 placements · upd. 31.08", faces: ["a.ivanova", "d.smirnov", "k.petrov"], peopleLabel: "26 accounts" }),
  t("tank-farm-south", "Tank Farm South", "company", { meta: "tank-farm-south · 8 placements · upd. 26.08", peopleLabel: "26 accounts" }),
  t("pipe-rack-b7", "Pipe Rack B7", "private", { meta: "pipe-rack-b7 · converting · job 8f22", faces: ["a.ivanova"], peopleLabel: "owner only" }),
  t("draft-site-01", "Draft Site 01", "private", { meta: "draft-site-01 · no placements yet", faces: ["a.ivanova"], peopleLabel: "owner only" }),
];

const GRANTS: AccessGrant[] = [
  { userId: "u-1", username: "a.ivanova", roleTitle: "Company Owner", via: "owner" },
  { userId: "u-2", username: "m.orlova", roleTitle: "People & Roles Manager", via: "role" },
  { userId: "u-3", username: "k.petrov", roleTitle: "Field Operator", via: "direct" },
  { userId: "u-4", username: "guest.viewer", roleTitle: "Guest · frozen", via: "direct", inactive: true },
];

const STATS = [
  { label: "Guests with access", value: "9", hint: "assigned individually" },
  { label: "Owner-only", value: "2", hint: "not shared yet", tone: "warn" as const },
  { label: "Grants", value: "38", hint: "24 direct · 14 via role", tone: "accent" as const },
];

const NAV = [
  { key: "users", label: "Users", href: "#" },
  { key: "roles", label: "Roles & Permissions", href: "#" },
  { key: "content", label: "Content", href: "#" },
  { key: "access", label: "Territory access", href: "#" },
  { key: "audit", label: "Audit journal", href: "#" },
  { key: "metrics", label: "Metrics", href: "#" },
];

const LABEL: Record<Visibility, string> = {
  assigned: "Assigned",
  company: "Whole company",
  private: "Owner-only",
};

function group(items: TerritoryAccess[]): AccessGroup[] {
  return (["assigned", "company", "private"] as const).map((visibility) => {
    const territories = items.filter((x) => x.visibility === visibility);
    return {
      key: visibility,
      label: LABEL[visibility],
      note: `${territories.length} territories`,
      territories,
    };
  });
}

function Live({ initialSelected }: { initialSelected: string | null }) {
  const [query, setQuery] = useState("visibility:assigned");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSelected);
  const [visibility, setVisibility] = useState<Visibility>("assigned");
  const [grants, setGrants] = useState(GRANTS);
  const [dirty, setDirty] = useState(false);

  const visible = useMemo(() => {
    const filters = parseFilters(query);
    return TERRITORIES.filter((x) =>
      filters.every((f) => (f.key === "visibility" ? x.visibility === f.value : true)),
    );
  }, [query]);

  const selected = TERRITORIES.find((x) => x.slug === selectedSlug) ?? null;
  const counts = {
    assigned: TERRITORIES.filter((x) => x.visibility === "assigned").length,
    company: TERRITORIES.filter((x) => x.visibility === "company").length,
    private: TERRITORIES.filter((x) => x.visibility === "private").length,
  };

  return (
    <ConsoleLayout
      items={NAV}
      active="access"
      backHref="#"
      viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
    >
      <TerritoryAccessPage
        groups={group(visible)}
        mix={{
          label: "Visibility mix",
          detail: `${TERRITORIES.length} territories`,
          segments: [
            { tone: "accent", value: counts.assigned, label: "assigned" },
            { tone: "ok", value: counts.company, label: "whole company" },
            { tone: "neutral", value: counts.private, label: "private" },
          ],
        }}
        stats={STATS}
        query={query}
        onQueryChange={setQuery}
        selectedSlug={selectedSlug}
        onManage={(x) => {
          setSelectedSlug(x.slug);
          setVisibility(x.visibility);
          setGrants(GRANTS);
          setDirty(false);
        }}
        onCloseInspector={() => setSelectedSlug(null)}
        managed={selected && { territory: selected, visibility, grants, dirty }}
        onVisibilityChange={(v) => {
          setVisibility(v);
          setDirty(true);
        }}
        onAddPerson={noop}
        onRemoveGrant={(id) => {
          setGrants((g) => g.filter((x) => x.userId !== id));
          setDirty(true);
        }}
        onCancel={() => {
          setGrants(GRANTS);
          setVisibility(selected?.visibility ?? "assigned");
          setDirty(false);
        }}
        onSave={() => setDirty(false)}
        onBulkAssign={noop}
      />
    </ConsoleLayout>
  );
}

export default {
  managing: <Live initialSelected="refinery-block-c" />,
  listOnly: <Live initialSelected={null} />,
};
