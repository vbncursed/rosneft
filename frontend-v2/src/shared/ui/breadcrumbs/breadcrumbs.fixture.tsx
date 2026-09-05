import { Breadcrumbs } from "./breadcrumbs";

export default (
  <div className="rounded-card border border-line bg-panel p-6">
    <Breadcrumbs
      items={[
        { label: "Catalog", href: "#" },
        { label: "Territories", href: "#" },
        { label: "refinery-block-c" },
      ]}
    />
  </div>
);
