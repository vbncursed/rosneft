import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Toaster } from "./ui/toaster";

export default (
  <div className="flex gap-2 p-6">
    <Button onClick={() => notify.success("Permissions saved")}>Success</Button>
    <Button onClick={() => notify.error("Cannot freeze the last admin.")}>Error</Button>
    <Button onClick={() => notify.error("Measurement not saved: network error", { label: "Retry", run: () => {} })}>
      Error with Retry
    </Button>
    <Button onClick={() => notify.warning("Two-factor status is unavailable right now.")}>Warning</Button>
    <Button onClick={() => notify.info("mesh-worker is processing storage-tank-500")}>Info</Button>
    <Button
      onClick={() => {
        for (let i = 1; i <= 5; i++) notify.error(`Failure ${i}`);
      }}
    >
      Five at once
    </Button>
    <Toaster />
  </div>
);
