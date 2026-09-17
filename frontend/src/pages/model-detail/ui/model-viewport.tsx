import { Icon } from "@/shared/ui/icon";

export type ModelViewportProps = { title: string; thumbnailUrl: string | null };

const GRID = {
  backgroundImage:
    "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
};

/** The mock's 560px viewport, holding the thumbnail: v2 has no 3D yet, and the model page never had one. */
export function ModelViewport({ title, thumbnailUrl }: ModelViewportProps) {
  return (
    <section
      aria-label="Preview"
      style={GRID}
      className="flex h-[560px] items-center justify-center overflow-hidden rounded-[14px] border border-line bg-panel-2"
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={title} className="size-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-3 text-line-2">
          <Icon name="cube" size={150} strokeWidth={0.7} />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">no image</span>
        </div>
      )}
    </section>
  );
}
