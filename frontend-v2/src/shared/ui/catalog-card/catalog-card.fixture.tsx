import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { CatalogCard } from "./catalog-card";

// A tiny inline placeholder — no network fetch inside a Cosmos fixture.
const PLACEHOLDER_THUMB =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200'%3E%3Crect width='100%25' height='100%25' fill='%23888'/%3E%3C/svg%3E";

export default {
  territories: (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5 p-6">
      <CatalogCard
        title="North Ridge Pad"
        slug="north-ridge-pad"
        description="Wellhead cluster and gathering lines across the northern block."
        badge={{ label: "ready", tone: "ok" }}
        chips={[
          { label: "3 placements", tone: "plain" },
          { label: "412 MB", tone: "plain" },
          { label: "panorama", tone: "ok" },
        ]}
        trailing={{ label: "Open →", tone: "accent" }}
        onOpen={() => {}}
      />
      <CatalogCard
        title="Terminal Yard 4"
        slug="terminal-yard-4"
        tone="warn"
        badge={{ label: "converting", tone: "warn" }}
        chips={[
          { label: "LOD 0-1", tone: "warn" },
          { label: "760 MB", tone: "plain" },
        ]}
        progress={{ value: 62, stage: "Compressing textures… ~4 min" }}
        trailing={{ label: "converting", tone: "warn" }}
      />
      <CatalogCard
        title="Well Cluster 9"
        slug="well-cluster-9"
        description="Six wellheads with shared gathering manifold."
        badge={{ label: "ready", tone: "ok" }}
        chips={[
          { label: "6 placements", tone: "plain" },
          { label: "288 MB", tone: "plain" },
          { label: "assigned to you", tone: "accent" },
        ]}
        trailing={{ label: "Open →", tone: "accent" }}
        onOpen={() => {}}
        actions={
          <>
            <Button
              shape="icon"
              size="sm"
              variant="secondary"
              aria-label="Replace source of Well Cluster 9"
            >
              <Icon name="refresh" size={14} />
            </Button>
            <Button shape="icon" size="sm" variant="secondary" aria-label="Delete Well Cluster 9">
              <Icon name="trash" size={14} />
            </Button>
          </>
        }
      />
      <CatalogCard
        title="Pipe Rack B7"
        slug="pipe-rack-b7"
        description="Source archive rejected — the OBJ references textures by absolute path."
        tone="bad"
        badge={{ label: "failed", tone: "bad" }}
        chips={[
          { label: "—", tone: "plain" },
          { label: "1.1 GB", tone: "plain" },
        ]}
        trailing={{ label: "unavailable", tone: "muted" }}
      />
    </div>
  ),
  models: (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(216px,1fr))] gap-3 p-6">
      <CatalogCard
        size="sm"
        title="Pump Jack Unit"
        slug="pump-jack-unit"
        thumbnailUrl={PLACEHOLDER_THUMB}
        trailing={{ label: "in 6 territories", tone: "accent" }}
        onOpen={() => {}}
      />
      <CatalogCard
        size="sm"
        title="Flare Stack"
        slug="flare-stack"
        tone="bad"
        badge={{ label: "failed", tone: "bad" }}
        noImageLabel="no image"
        trailing={{ label: "unavailable", tone: "bad" }}
      />
      <CatalogCard
        size="sm"
        title="Ladder Platform"
        slug="ladder-platform"
        noImageLabel="no image"
        trailing={{ label: "unused", tone: "muted" }}
      />
    </div>
  ),
};
