import { useState } from "react";
import { Dropdown, type DropdownOption } from "./dropdown";

type Entity = "any" | "territory" | "model" | "placement";

const OPTIONS: DropdownOption<Entity>[] = [
  { value: "any", label: "any" },
  { value: "territory", label: "territory", hint: "12" },
  { value: "model", label: "model", hint: "31" },
  { value: "placement", label: "placement", hint: "locked", disabled: true },
];

function Live() {
  const [value, setValue] = useState<Entity>("territory");
  return <Dropdown options={OPTIONS} value={value} onChange={setValue} ariaLabel="Entity" />;
}

export default (
  <div className="flex max-w-xs flex-col gap-3.5 rounded-card border border-line bg-panel p-6">
    <Dropdown
      options={[
        { value: "active", label: "Active" },
        { value: "frozen", label: "Frozen" },
      ]}
      value="active"
      onChange={() => {}}
      label="Status"
    />
    <Live />
    <Dropdown options={OPTIONS} value="any" onChange={() => {}} ariaLabel="Any" disabled />
  </div>
);
