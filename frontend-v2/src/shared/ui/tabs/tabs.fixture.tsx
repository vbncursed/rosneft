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

function Segments() {
  const [value, setValue] = useState("view");
  return (
    <Tabs
      variant="segments"
      ariaLabel="Overlays sections"
      className="rounded-[9px] border border-line bg-panel-2 px-2.5 py-2"
      value={value}
      onChange={setValue}
      tabs={[
        { value: "view", label: "View" },
        { value: "placements", label: "Placements (4)" },
      ]}
    />
  );
}

export default {
  underline: (
    <div className="rounded-card border border-line bg-panel p-6">
      <Live />
    </div>
  ),
  segments: (
    <div className="w-[320px] rounded-card border border-line bg-panel p-6">
      <Segments />
    </div>
  ),
};
