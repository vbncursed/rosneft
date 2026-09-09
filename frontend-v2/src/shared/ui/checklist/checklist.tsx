import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";

export type ChecklistItem = { label: string; ok: boolean };

export type ChecklistProps = {
  items: ChecklistItem[];
  /** Names the list for assistive tech. */
  label?: string;
  className?: string;
};

/** A short list of pass/fail requirements — the upload sidebar's "before you submit" card. */
export function Checklist({ items, label, className }: ChecklistProps) {
  return (
    <ul aria-label={label ?? "Checklist"} className={cx("m-0 flex list-none flex-col gap-2 p-0", className)}>
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-[9px]">
          <Icon
            name={item.ok ? "check" : "minus"}
            size={13}
            className={cx("mt-0.5 shrink-0", item.ok ? "text-ok" : "text-muted")}
          />
          <span className={cx("text-xs leading-[1.45]", item.ok ? "text-fg" : "text-muted")}>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
