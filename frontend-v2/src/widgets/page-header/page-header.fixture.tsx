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
    <PageHeader
      size="xl"
      back={{ label: "← Home", href: "#" }}
      eyebrow="Territory catalog"
      title="Scenes to walk through"
      description="Sites you have access to. Open one to inspect it in 3D, measure distances and place models."
      action={
        <Button shape="pill" variant="primary">
          + Upload
        </Button>
      }
    />
    <PageHeader eyebrow="Model library" title="Everything you can place" />
  </div>
);
