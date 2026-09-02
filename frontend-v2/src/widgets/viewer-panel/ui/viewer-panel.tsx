import { formatSize, groupDigits } from "../model/format";

export type ModelMetadata = {
  vertices?: number;
  faces?: number;
  dimensions?: { x: number; y: number; z: number };
};

export type ViewerPanelProps = {
  title: string;
  back: { label: string; href: string };
  metadata?: ModelMetadata;
  /** Replaces the navigation hint while a tool is active. */
  toolHint?: string;
};

const CONTROLS_HINT = "Drag: rotate · Wheel: zoom · Right click: pan · M: measure";

export function ViewerPanel({ title, back, metadata, toolHint }: ViewerPanelProps) {
  const stats = [
    metadata?.vertices !== undefined ? `Vertices: ${groupDigits(metadata.vertices)}` : null,
    metadata?.faces !== undefined ? `Faces: ${groupDigits(metadata.faces)}` : null,
    metadata?.dimensions ? `Size: ${formatSize(metadata.dimensions)}` : null,
  ].filter((line): line is string => line !== null);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4.5">
      <div className="rounded-[10px] border border-line-2 bg-panel-2 p-3.5">
        <a
          href={back.href}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent no-underline hover:underline"
        >
          {back.label}
        </a>
        <p className="m-0 mt-2.5 text-sm font-semibold text-fg">{title}</p>

        {stats.length > 0 ? (
          <div className="mt-2.5 flex flex-col gap-1 font-mono text-[11px] text-muted">
            {stats.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ) : null}
      </div>

      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Hints</p>
      <p
        className={
          toolHint
            ? "m-0 rounded-control border border-accent-line bg-accent-soft px-3 py-[9px] text-[11px] leading-[1.5] text-accent"
            : "m-0 rounded-control border border-line-2 bg-panel-2 px-3 py-[9px] text-[11px] leading-[1.5] text-muted"
        }
      >
        {toolHint ?? CONTROLS_HINT}
      </p>
    </div>
  );
}
