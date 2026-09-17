import { Checkbox } from "./checkbox";

export default (
  <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-6">
    <Checkbox label="Checked" defaultChecked />
    <Checkbox label="Unchecked" />
    <Checkbox label="Disabled" disabled />
    <Checkbox label="Disabled checked" disabled defaultChecked />
  </div>
);
