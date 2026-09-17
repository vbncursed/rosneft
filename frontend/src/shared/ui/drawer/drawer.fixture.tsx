import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/text-field";
import { Drawer } from "./drawer";

function CreateUser() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button shape="pill" variant="primary" onClick={() => setOpen(true)}>
        + New user
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New user"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Create
            </Button>
          </>
        }
      >
        <TextField label="username" placeholder="username" />
        <TextField label="email" placeholder="email" />
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="accent" shape="tag" className="tracking-normal">Field Operator</Badge>
          <Badge tone="neutral" fill="outline" shape="tag" className="tracking-normal">Guest</Badge>
          <Badge tone="neutral" fill="outline" shape="tag" className="tracking-normal">People &amp; Roles</Badge>
        </div>
      </Drawer>
    </>
  );
}

export default (
  <div className="rounded-card border border-line bg-panel p-6">
    <CreateUser />
  </div>
);
