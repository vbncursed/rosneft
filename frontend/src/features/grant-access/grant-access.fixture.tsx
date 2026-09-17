import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { AddPersonDialog } from "./ui/add-person-dialog";

const OPTIONS = [
  { id: "u-1", username: "a.ivanova", hint: "Editor" },
  { id: "u-2", username: "k.petrov", hint: "Field Operator" },
];

function Demo({ options }: { options: typeof OPTIONS }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Add person</Button>
      {open ? <AddPersonDialog open options={options} onClose={() => setOpen(false)} onAdd={() => setOpen(false)} /> : null}
    </div>
  );
}

export default {
  WithOptions: <Demo options={OPTIONS} />,
  Exhausted: <Demo options={[]} />,
};
