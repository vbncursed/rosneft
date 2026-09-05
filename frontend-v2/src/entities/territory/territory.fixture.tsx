import { AccessRow } from "./ui/access-row";
import { TerritoryAccessRow } from "./ui/territory-access-row";

const ACCESS_ROWS = [
  {
    slug: "refinery-block-c",
    title: "Refinery Block C",
    visibility: "assigned" as const,
    meta: "refinery-block-c · 14 placements · upd. 29.08",
    faces: ["a.ivanova", "m.orlova", "k.petrov"],
    peopleLabel: "4 people",
  },
  {
    slug: "north-ridge-pad",
    title: "North Ridge Pad",
    visibility: "company" as const,
    meta: "north-ridge-pad · 3 placements · upd. 31.08",
    faces: ["a.ivanova", "d.smirnov"],
    peopleLabel: "26 accounts",
  },
  {
    slug: "draft-site-01",
    title: "Draft Site 01",
    visibility: "private" as const,
    meta: "draft-site-01 · no placements yet",
    faces: ["a.ivanova"],
    peopleLabel: "owner only",
  },
];

export default {
  accessRows: (
    <div className="flex max-w-3xl flex-col gap-2.5 p-6">
      {ACCESS_ROWS.map((t, i) => (
        <TerritoryAccessRow key={t.slug} territory={t} selected={i === 0} onManage={() => {}} />
      ))}
    </div>
  ),
  access: (
    <div className="flex max-w-sm flex-col gap-1.5 rounded-card border border-line bg-panel p-6">
      <AccessRow slug="refinery-block-c" via="direct" />
      <AccessRow slug="north-ridge-pad" via="role" />
    </div>
  ),
};
