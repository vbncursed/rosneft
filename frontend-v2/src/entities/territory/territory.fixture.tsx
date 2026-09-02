import { Button } from "@/shared/ui/button";
import { TerritoryCard } from "./ui/territory-card";
import type { Territory } from "./model/territory";

const base: Territory = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  description: "Distillation towers, tank farm, and pipe racks for Block C.",
  sourceBlobHash: "abc123",
};

export default (
  <div className="grid gap-4 md:grid-cols-3">
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
