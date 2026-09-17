import { TextField } from "./text-field";
import { Textarea } from "./textarea";

export default (
  <div className="flex max-w-md flex-col gap-4 rounded-card border border-line bg-panel p-6">
    <TextField label="Title" required defaultValue="Refinery Block C" hint="Shown in the catalog" />
    <TextField label="Slug" mono defaultValue="refinery-block-c" />
    <TextField label="Email" defaultValue="not-an-email" error="Enter a valid address" />
    <TextField label="Company" disabled defaultValue="Locked" />
    <Textarea label="Description" defaultValue="Distillation towers, tank farm, and pipe racks." />
  </div>
);
