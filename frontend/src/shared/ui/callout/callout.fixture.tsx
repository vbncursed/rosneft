import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Callout } from "./callout";

const Label = ({ children }: { children: string }) => (
  <p className="m-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{children}</p>
);

function Dismissible() {
  const [shown, setShown] = useState({ tip: true, done: true });
  return (
    <div className="flex flex-col gap-2.5">
      <Label>Dismissible</Label>
      {shown.tip ? (
        <Callout tone="neutral" onDismiss={() => setShown((s) => ({ ...s, tip: false }))} dismissLabel="Dismiss tip">
          Hold Shift while dragging to snap a placement to the ground grid.
        </Callout>
      ) : null}
      {shown.done ? (
        <Callout
          tone="ok"
          onDismiss={() => setShown((s) => ({ ...s, done: false }))}
          dismissLabel="Dismiss conversion notice"
        >
          LOD 3 is ready — the viewer switched to it.
        </Callout>
      ) : null}
      {!shown.tip || !shown.done ? (
        <Button size="sm" className="self-start" onClick={() => setShown({ tip: true, done: true })}>
          Show again
        </Button>
      ) : null}
    </div>
  );
}

export default {
  tones: (
    <div className="flex max-w-md flex-col gap-2.5 rounded-card border border-line bg-panel p-6">
      <Label>Tones · icon follows the tone</Label>
      <Callout tone="bad">No 2FA and no passkey — password only.</Callout>
      <Callout tone="warn">You cannot grant a permission you do not have.</Callout>
      <Callout tone="ok">Every change on this territory is recorded.</Callout>
      <Callout tone="accent">This role is assigned from the Users page.</Callout>
      <Callout tone="neutral">Placements are shared by everyone who can open this territory.</Callout>
      <Callout tone="loading">Rebuilding the preview thumbnails…</Callout>
    </div>
  ),
  sizes: (
    <div className="flex max-w-md flex-col gap-2.5 rounded-card border border-line bg-panel p-6">
      <Label>Sizes · lg · title + mono · note</Label>
      <Callout tone="warn" size="lg">
        <>
          <strong className="block text-[13px] font-semibold">The territory goes back to converting</strong>
          <span className="mt-[5px] block text-xs leading-[1.5] text-fg">
            While the new mesh is processed the viewer shows the conversion screen.
          </span>
        </>
      </Callout>
      <Callout tone="bad" size="lg" title="Worker message" mono>
        ktx2: unsupported pixel format in tank_albedo_04.tga
      </Callout>
      <Callout tone="loading" size="lg" title="Conversion">
        Compressing textures — about 4 minutes left.
      </Callout>
      <Callout tone="warn" icon="info" size="note">
        This page opens the viewer by itself once the artifacts land — no need to reload. Closing the tab does not stop
        the job.
      </Callout>
    </div>
  ),
  dismissible: (
    <div className="flex max-w-md flex-col gap-2.5 rounded-card border border-line bg-panel p-6">
      <Dismissible />
    </div>
  ),
};
