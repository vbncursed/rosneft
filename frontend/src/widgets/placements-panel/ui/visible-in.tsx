import { Checkbox } from "@/shared/ui/checkbox";
import { VISIBLE_IN, VISIBLE_IN_NOTE } from "../model/panel-copy";

export type VisibleInProps = {
  placement: { id: number; visiblePanoramaIds: number[] };
  panoramas: { id: number; title: string }[];
  /** A mutation on this placement is in flight; the checkboxes wait for it. */
  pending: boolean;
  onToggle: (panoramaId: number, visible: boolean) => void;
};

/** The selected instance's per-panorama allowlist, drawn under its row and indented with it. */
export function VisibleIn({ placement, panoramas, pending, onToggle }: VisibleInProps) {
  return (
    <div className="ml-3 flex flex-col gap-[9px] rounded-b-[9px] border-t border-accent-line bg-panel p-[11px]">
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">{VISIBLE_IN}</span>
      {panoramas.map((panorama) => {
        const checked = placement.visiblePanoramaIds.includes(panorama.id);
        return (
          <Checkbox
            key={panorama.id}
            label={panorama.title}
            checked={checked}
            onChange={(e) => onToggle(panorama.id, e.target.checked)}
            disabled={pending}
            tone={checked ? "default" : "muted"}
          />
        );
      })}
      <p className="m-0 text-[11px] leading-[1.5] text-muted">{VISIBLE_IN_NOTE}</p>
    </div>
  );
}
