import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import type { ConsoleHint } from "../model/console-hints";

export type ConsoleCardProps = { label: string; href: string; hint: ConsoleHint; locked: boolean };

const BOX = "block rounded-[11px] border border-line px-4 py-3.5 no-underline";

/** A doorway into one console screen; locked when the reader lacks its grant. */
export function ConsoleCard({ label, href, hint, locked }: ConsoleCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2.5">
        <p className={cx("m-0 text-[13px] font-semibold", locked ? "text-muted" : "text-fg")}>
          {label}
        </p>
        {locked ? (
          <Icon name="lock" size={13} title="No access" className="shrink-0 text-muted" />
        ) : (
          <Icon name="arrow-right" size={13} className="shrink-0 text-accent" />
        )}
      </div>
      <p className="m-0 mt-1.5 font-mono text-[10px] text-muted">{hint.text}</p>
    </>
  );

  return locked ? (
    <div aria-disabled="true" className={cx(BOX, "cursor-not-allowed bg-panel-2")}>
      {body}
    </div>
  ) : (
    <a
      href={href}
      className={cx(
        BOX,
        "bg-panel text-inherit hover:border-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      {body}
    </a>
  );
}
