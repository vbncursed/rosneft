import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { CatalogCard } from "./catalog-card";

export default (
  <div className="grid gap-4 md:grid-cols-3">
    <CatalogCard
      kind="Territory"
      title="Refinery Block C"
      description="Distillation towers, tank farm, and pipe racks for Block C."
      slug="refinery-block-c"
      href="#"
      badge={<Badge tone="ok" fill="outline" size="sm">ready</Badge>}
      trailing="Open →"
    />
    <CatalogCard
      kind="Territory · hover"
      title="North Ridge Pad"
      description="Wellhead cluster and gathering lines across the northern block."
      slug="north-ridge-pad"
      href="#"
      highlighted
      trailing="Open →"
      actions={
        <div className="flex gap-1.5">
          <Button size="sm" shape="pill">Replace</Button>
          <Button size="sm" shape="pill" variant="danger">Delete</Button>
        </div>
      }
    />
    <CatalogCard
      kind="Model"
      title="Flare Stack"
      description="Elevated flare with knockout drum."
      slug="flare-stack"
      muted
      badge={<Badge tone="warn" fill="outline" size="sm">converting</Badge>}
      trailing="42%"
    />
  </div>
);
