import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Toaster } from "./ui/toaster";

export default (
  <div className="flex gap-2 p-6">
    <Button onClick={() => notify.success("Permissions saved")}>Success</Button>
    <Button onClick={() => notify.error("Cannot freeze the last admin.")}>Error</Button>
    <Toaster />
  </div>
);
