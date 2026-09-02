import { useState } from "react";
import { AccessGroups, type AccessGroup } from "./ui/access-groups";
import type { TerritoryAccess } from "@/entities/territory";

const t = (
  slug: string,
  title: string,
  over: Partial<TerritoryAccess> = {},
): TerritoryAccess => ({
  slug,
  title,
  visibility: "assigned",
  meta: `${slug} · 14 placements · upd. 29.08`,
  faces: ["a.ivanova", "m.orlova"],
  peopleLabel: "4 people",
  ...over,
});

const GROUPS: AccessGroup[] = [
  {
    key: "assigned",
    label: "Assigned",
    note: "6 territories",
    territories: [
      t("refinery-block-c", "Refinery Block C", { faces: ["a.ivanova", "m.orlova", "k.petrov"] }),
      t("terminal-yard-4", "Terminal Yard 4", { meta: "terminal-yard-4 · converting · job 8f21", faces: ["d.smirnov"], peopleLabel: "1 person" }),
    ],
  },
  {
    key: "company",
    label: "Whole company",
    note: "4 territories",
    territories: [
      t("north-ridge-pad", "North Ridge Pad", { visibility: "company", peopleLabel: "26 accounts", faces: ["a.ivanova", "d.smirnov", "k.petrov"] }),
    ],
  },
  {
    key: "private",
    label: "Owner-only",
    note: "2 territories",
    territories: [
      t("draft-site-01", "Draft Site 01", { visibility: "private", meta: "draft-site-01 · no placements yet", faces: ["a.ivanova"], peopleLabel: "owner only" }),
    ],
  },
];

function Live() {
  const [selected, setSelected] = useState<string | null>("refinery-block-c");
  return (
    <AccessGroups groups={GROUPS} selectedSlug={selected} onManage={(x) => setSelected(x.slug)} />
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
      <AccessGroups groups={[{ key: "assigned", label: "Assigned", territories: [] }]} onManage={() => {}} />
    </div>
  ),
};
