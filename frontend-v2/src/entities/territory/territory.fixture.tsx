import { Button } from "@/shared/ui/button";
import { AccessRow } from "./ui/access-row";
import { TerritoryAccessRow } from "./ui/territory-access-row";
import { TerritoryCard } from "./ui/territory-card";
import type { Territory } from "./model/territory";

const base: Territory = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  description: "Distillation towers, tank farm, and pipe racks for Block C.",
  sourceBlobHash: "abc123",
};

const cards = (
  <div className="p-6 grid gap-4 md:grid-cols-3">
    <TerritoryCard territory={base} conversion={{ status: "ready" }} />
    <TerritoryCard
      highlighted
      territory={{
        ...base,
        slug: "north-ridge-pad",
        title: "North Ridge Pad",
        description: "Wellhead cluster and gathering lines across the northern block.",
      }}
      conversion={{ status: "ready" }}
      actions={
        <div className="flex gap-1.5">
          <Button size="sm" shape="pill">Replace</Button>
          <Button size="sm" shape="pill" variant="danger">Delete</Button>
        </div>
      }
    />
    <TerritoryCard
      territory={{ ...base, slug: "south-gathering", title: "South Gathering Station" }}
      conversion={{ status: "converting", progress: 42 }}
    />
  </div>
);

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
  cards,
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
