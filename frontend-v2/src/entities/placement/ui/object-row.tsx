import { clsx as cx } from "clsx";
import { useState } from "react";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import type { Placement } from "../model/placement";

export type ObjectRowProps = {
  placement: Placement;
  selected: boolean;
  /** Clicking the name selects; clicking it again deselects. */
  onSelect: (id: number | null) => void;
  onRename: (id: number, label: string) => void;
  onDelete: (id: number) => void;
  /**
   * Present only while a panorama is open — the checkbox is "show in this
   * panorama", which has no meaning in the plain 3D view.
   */
  visibleInPanorama?: boolean;
  onToggleVisible?: (id: number, visible: boolean) => void;
  canWrite?: boolean;
  canDelete?: boolean;
  /** A mutation is in flight; the row's controls wait for it. */
  pending?: boolean;
};

const ICON_BUTTON =
  "shrink-0 cursor-pointer rounded border-none bg-transparent p-1 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export function ObjectRow({
  placement,
  selected,
  onSelect,
  onRename,
  onDelete,
  visibleInPanorama,
  onToggleVisible,
  canWrite = true,
  canDelete = true,
  pending = false,
}: ObjectRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const commit = () => {
    const next = (draft ?? "").trim();
    if (next && next !== placement.label) onRename(placement.id, next);
    setDraft(null);
  };

  return (
    <div
      className={cx(
        "flex items-center gap-2 rounded-control border px-2.5 py-[7px] transition-colors duration-150",
        selected ? "border-accent bg-accent-soft" : "border-line-2",
      )}
    >
      {onToggleVisible ? (
        <Checkbox
          checked={visibleInPanorama ?? false}
          disabled={!canWrite || pending}
          onChange={(e) => onToggleVisible(placement.id, e.target.checked)}
          aria-label={`Show ${placement.label} in this panorama`}
        />
      ) : null}

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
          aria-label={`Rename ${placement.label}`}
          className="min-w-0 flex-1 rounded-control-sm border border-accent bg-panel-2 px-[7px] py-1 text-xs text-fg outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect(selected ? null : placement.id)}
          aria-pressed={selected}
          className={cx(
            "min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent p-0 text-left text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            selected ? "text-accent" : "text-fg",
          )}
        >
          {placement.label}
        </button>
      )}

      {canWrite && !editing ? (
        <button
          type="button"
          onClick={() => setDraft(placement.label)}
          disabled={pending}
          title="Rename"
          aria-label={`Rename ${placement.label}`}
          className={cx(ICON_BUTTON, selected ? "text-accent" : "text-muted")}
        >
          <Icon name="pencil" size={14} />
        </button>
      ) : null}

      {canDelete && !editing ? (
        <button
          type="button"
          onClick={() => onDelete(placement.id)}
          disabled={pending}
          title="Delete"
          aria-label={`Delete ${placement.label}`}
          className={cx(ICON_BUTTON, selected ? "text-accent" : "text-muted")}
        >
          <Icon name="trash" size={14} />
        </button>
      ) : null}
    </div>
  );
}
