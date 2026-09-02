import { Button } from "@/shared/ui/button";
import { PageHeader } from "./ui/page-header";

export default (
  <div className="flex flex-col gap-8 rounded-card border border-line bg-panel p-6">
    <PageHeader
      back={{ label: "← Home", href: "#" }}
      eyebrow="Territory catalog"
      title="Scenes to walk through"
      action={
        <Button shape="pill" variant="primary">
          + Upload
        </Button>
      }
    />
    <PageHeader eyebrow="Model library" title="Everything you can place" />
  </div>
);
