import type { PointerEvent, ReactNode } from "react";
import { clsx as cx } from "clsx";
import { Icon, type IconName } from "@/shared/ui/icon";

export type ViewportWindowAction = { name: string; icon: IconName; tone?: "default" | "bad"; onClick: () => void };

export type ViewportWindowProps = {
  title: string;
  /** null = fills its container at the 14 inset (expanded); a geometry = floating. */
  geometry: { x: number; y: number; w: number; h: number } | null;
  actions: ViewportWindowAction[];
  onMoveStart?: (e: PointerEvent<HTMLElement>) => void;
  onResizeStart?: (e: PointerEvent<HTMLElement>) => void;
  /** True while a drag runs: a transparent shield covers the body so an iframe cannot eat the pointer. */
  dragging?: boolean;
  children: ReactNode;
  className?: string;
};

const ACTION =
  "flex size-6 cursor-pointer items-center justify-center rounded-[6px] border transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The mock's "viewport window": a floating panel with a title bar that can be
 * dragged by its handle, resized from its corner, and that fills the viewport
 * when `geometry` is null. It knows nothing about what it holds; the document
 * window puts the pdf.js frame in it.
 */
export function ViewportWindow({ title, geometry, actions, onMoveStart, onResizeStart, dragging = false, children, className }: ViewportWindowProps) {
  const floating = geometry !== null;
  return (
    <section
      role="dialog"
      aria-label={title}
      style={floating ? { left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h } : undefined}
      className={cx(
        "pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-card border border-line-2 bg-panel shadow-elevation",
        !floating && "inset-3.5",
        // The cursor holds over the whole window, iframe shield included.
        dragging && "cursor-grabbing",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-line bg-panel-2 px-[11px] py-[9px]">
        {floating ? (
          <span
            title="Drag to move"
            onPointerDown={onMoveStart}
            className="flex cursor-grab select-none items-center text-dim [touch-action:none] active:cursor-grabbing"
          >
            <Icon name="grip" size={14} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">{title}</span>
        {actions.map((a) => (
          <button
            key={a.name}
            type="button"
            title={a.name}
            aria-label={a.name}
            onClick={a.onClick}
            className={cx(ACTION, a.tone === "bad" ? "border-bad bg-bad-soft text-bad" : "border-line-2 bg-panel text-fg hover:border-accent-line")}
          >
            <Icon name={a.icon} size={12} />
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 bg-panel-2">
        {children}
        {dragging ? <div data-testid="drag-shield" className="absolute inset-0" /> : null}
      </div>
      {floating && onResizeStart ? (
        // A 20px target around the mock's 16px corner mark.
        <span
          title="Resize"
          onPointerDown={onResizeStart}
          className="absolute bottom-0 right-0 size-5 cursor-se-resize select-none [touch-action:none]"
        >
          <span aria-hidden="true" className="absolute bottom-0 right-0 size-4 border-b-2 border-r-2 border-dim" />
        </span>
      ) : null}
    </section>
  );
}
