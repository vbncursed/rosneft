import { useState, type ReactNode } from "react";
import { OverlaysPanel } from "./ui/overlays-panel";
import type { OverlaysTab } from "./model/use-overlays-panel";

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between border-b border-line py-2 text-[12px] last:border-0">
    <span className="text-muted">{label}</span>
    <span className="font-mono text-[11px] text-fg">{value}</span>
  </div>
);

const VIEW = (
  <div>
    <Row label="Grid" value="on" />
    <Row label="Lighting" value="studio" />
    <Row label="Wireframe" value="off" />
  </div>
);

const PLACEMENTS = (
  <div>
    <Row label="pump-station-a" value="scale 1.0" />
    <Row label="pipe-rack-12" value="scale 0.8" />
    <Row label="tank-t4" value="scale 1.0" />
    <Row label="valve-cluster" value="scale 1.2" />
  </div>
);

/** A 700px relative box: the panel is absolutely positioned against the scene. */
function Stage({ children }: { children: ReactNode }) {
  return <div className="relative h-[700px] rounded-card bg-panel-2">{children}</div>;
}

function Live({
  initial,
  initialCollapsed = false,
}: {
  initial: OverlaysTab;
  initialCollapsed?: boolean;
}) {
  const [tab, setTab] = useState<OverlaysTab>(initial);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <Stage>
      <OverlaysPanel
        tab={tab}
        onTabChange={setTab}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        placementsCount={4}
        view={VIEW}
        placements={PLACEMENTS}
      />
    </Stage>
  );
}

export default {
  view: <Live initial="view" />,
  placements: <Live initial="placements" />,
  collapsed: <Live initial="view" initialCollapsed />,
};
