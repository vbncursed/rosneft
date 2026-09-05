import { clsx as cx } from "clsx";
import { Fragment, type ReactNode } from "react";

export type DetailTone = "fg" | "ok" | "warn" | "bad" | "dim" | "muted";

export type Detail = {
  label: string;
  value: ReactNode;
  tone?: DetailTone;
};

export type DetailListProps = {
  items: Detail[];
  className?: string;
};

const TONE: Record<DetailTone, string> = {
  fg: "text-fg",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  dim: "text-dim",
  muted: "text-muted",
};

/** The mono key/value block both inspectors use for a record's facts. */
export function DetailList({ items, className }: DetailListProps) {
  if (items.length === 0) return null;

  return (
    <dl
      className={cx(
        "m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 font-mono text-[11px]",
        className,
      )}
    >
      {items.map((item) => (
        <Fragment key={item.label}>
          <dt className="text-dim">{item.label}</dt>
          <dd className={cx("m-0 break-all", TONE[item.tone ?? "fg"])}>{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
