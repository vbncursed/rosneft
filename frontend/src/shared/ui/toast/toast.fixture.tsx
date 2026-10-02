import { useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Toast, ToastStack, type ToastStackItem } from "./toast";

const Label = ({ children }: { children: string }) => (
  <p className="m-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{children}</p>
);

const SAMPLES: Omit<ToastStackItem, "id">[] = [
  { tone: "success", children: "Permissions saved." },
  { tone: "error", children: "Measurement not saved: network error.", action: { label: "Retry", onClick: () => {} } },
  { tone: "info", children: "mesh-worker is processing storage-tank-500." },
  { tone: "neutral", children: "3 placements moved to Group B." },
  { tone: "warning", children: "Two-factor status is unavailable right now." },
];

function StackDemo() {
  const [toasts, setToasts] = useState<ToastStackItem[]>([
    { id: 1, tone: "loading", children: "Converting north-ridge-pad.obj — LOD 2 of 4", progress: 62 },
    { id: 2, tone: "success", children: "Panorama pinned to Terminal Yard 4." },
  ]);
  const next = useRef(3);
  const push = () => {
    const sample = SAMPLES[next.current % SAMPLES.length];
    setToasts((all) => [...all, { ...sample, id: next.current++ }]);
  };
  return (
    <div className="flex max-w-[760px] flex-col gap-3 p-6">
      <Label>Stack · top-right · newest on top · max 3</Label>
      <div className="relative flex min-h-[300px] justify-end rounded-card border border-line bg-bg p-4">
        <div className="absolute bottom-4 left-4 flex gap-2">
          <Button size="sm" variant="primary" onClick={push}>
            Push a toast
          </Button>
          <Button size="sm" onClick={() => setToasts([])}>
            Clear
          </Button>
        </div>
        <ToastStack
          position="inline"
          toasts={toasts}
          onDismiss={(id) => setToasts((all) => all.filter((t) => t.id !== id))}
        />
      </div>
    </div>
  );
}

export default {
  tones: (
    <div className="flex max-w-md flex-col gap-2.5 rounded-card border border-line bg-panel p-6">
      <Label>Tones</Label>
      <Toast tone="error" onDismiss={() => {}} action={{ label: "Retry", onClick: () => {} }}>
        Measurement not saved: network error.
      </Toast>
      <Toast tone="warning" onDismiss={() => {}}>
        Two-factor status is unavailable right now.
      </Toast>
      <Toast tone="info" onDismiss={() => {}} duration={null}>
        mesh-worker is processing storage-tank-500.
      </Toast>
      <Toast tone="success" onDismiss={() => {}} duration={null}>
        Passkey added.
      </Toast>
      <Toast tone="neutral" onDismiss={() => {}} duration={null}>
        3 placements moved to Group B.
      </Toast>
      <Toast tone="loading" progress={62}>
        Converting north-ridge-pad.obj — LOD 2 of 4
      </Toast>
      <Toast tone="loading">Waiting for a conversion worker…</Toast>
    </div>
  ),
  stack: <StackDemo />,
};
