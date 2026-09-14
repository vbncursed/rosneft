import { Toast } from "./toast";

export default (
  <div className="flex max-w-md flex-col gap-2.5 rounded-card border border-line bg-panel p-6">
    <Toast tone="error" onDismiss={() => {}}>
      Conversion failed: OBJ parse error at line 84120.
    </Toast>
    <Toast tone="warning" onDismiss={() => {}}>
      Two-factor status is unavailable right now.
    </Toast>
    <Toast tone="info" onDismiss={() => {}}>
      mesh-worker is processing storage-tank-500.
    </Toast>
    <Toast tone="success" onDismiss={() => {}}>
      Passkey added.
    </Toast>
  </div>
);
