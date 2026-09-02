import { useState } from "react";
import { Tabs } from "./tabs";

function Live() {
  const [value, setValue] = useState("overview");
  return (
    <Tabs
      ariaLabel="Territory sections"
      value={value}
      onChange={setValue}
      tabs={[
        { value: "overview", label: "Overview" },
        { value: "placements", label: "Placements" },
        { value: "documents", label: "Documents" },
        { value: "panoramas", label: "Panoramas", disabled: true },
      ]}
    />
  );
}

export default (
  <div className="rounded-card border border-line bg-panel p-6">
    <Live />
  </div>
);
