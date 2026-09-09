import { useId, useRef, useState } from "react";
import { clsx as cx } from "clsx";
import { useDismiss } from "@/shared/lib/use-dismiss";
import { Icon } from "@/shared/ui/icon";
import {
  WEEKDAYS,
  dayLabel,
  monthGrid,
  monthLabel,
  parseIso,
  shiftMonth,
  toIso,
  type IsoDate,
} from "./calendar";

export type DatePickerProps = {
  /** "YYYY-MM-DD", or "" for no date chosen. */
  value: IsoDate | "";
  onChange: (value: IsoDate) => void;
  label: string;
  /** Marked with a ring; defaults to the real today. */
  today?: IsoDate;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Which trigger edge the calendar hangs from; "end" for a picker at the
   * right edge of a row. Defaults to "start" — unlike `Menu`, whose default
   * is "end" — because every existing picker anchors left.
   */
  align?: "start" | "end";
};

const realToday = (): IsoDate => {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
};

export function DatePicker({
  value,
  onChange,
  label,
  today,
  placeholder = "yyyy-mm-dd",
  disabled = false,
  className,
  align = "start",
}: DatePickerProps) {
  const gridId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const todayIso = today ?? realToday();

  const anchor = parseIso(value) ?? parseIso(todayIso)!;
  const [view, setView] = useState({ year: anchor.year, month: anchor.month });

  useDismiss(root, open, () => setOpen(false));

  const days = monthGrid(view.year, view.month);

  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          const next = parseIso(value);
          if (next) setView({ year: next.year, month: next.month });
          setOpen((o) => !o);
        }}
        className={cx(
          "flex w-full items-center justify-between gap-3 rounded-control border bg-panel-2 px-3 py-2.5 font-mono text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          disabled
            ? "cursor-not-allowed border-line text-dim opacity-55"
            : "cursor-pointer border-line-2 text-fg",
          open && "border-accent",
        )}
      >
        <span className={value ? undefined : "text-dim"}>{value || placeholder}</span>
        <Icon name="calendar" size={15} className="text-muted" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className={cx(
            "absolute z-10 mt-1 w-[17.5rem] rounded-[10px] border border-line-2 bg-panel-2 p-3.5 shadow-elevation",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <div className="mb-2.5 flex items-center justify-between gap-4">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
              className="cursor-pointer border-none bg-transparent px-1 text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              ←
            </button>
            <span aria-live="polite" className="text-[13px] font-semibold text-fg">
              {monthLabel(view.year, view.month)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              className="cursor-pointer border-none bg-transparent px-1 text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              →
            </button>
          </div>

          {/* Deliberately not role="grid": a real grid needs rows and roving
              focus, and a half-built one reads worse than plain buttons. Each
              day names its own full date instead. */}
          <div id={gridId} className="grid grid-cols-7 gap-[3px]">
            {WEEKDAYS.map((weekday) => (
              <span
                key={weekday}
                aria-hidden="true"
                className="py-[3px] text-center font-mono text-[9px] uppercase tracking-[0.1em] text-dim"
              >
                {weekday}
              </span>
            ))}

            {days.map((day) =>
              day.inMonth ? (
                <button
                  key={day.iso}
                  type="button"
                  aria-label={dayLabel(day.iso)}
                  aria-pressed={day.iso === value}
                  aria-current={day.iso === todayIso ? "date" : undefined}
                  onClick={() => {
                    onChange(day.iso);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex aspect-square cursor-pointer items-center justify-center rounded-control-sm border text-center font-mono text-[11px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                    day.iso === value
                      ? "border-accent bg-accent font-semibold text-accent-fg"
                      : day.iso === todayIso
                        ? "border-accent-line bg-transparent text-accent"
                        : "border-transparent bg-transparent text-fg hover:bg-panel",
                  )}
                >
                  {day.day}
                </button>
              ) : (
                <span key={day.iso} aria-hidden="true" className="aspect-square" />
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
