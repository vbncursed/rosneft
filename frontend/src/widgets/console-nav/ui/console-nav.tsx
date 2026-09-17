import { clsx as cx } from "clsx";

export type ConsoleNavItem = {
  key: string;
  label: string;
  href: string;
  /** A section the signed-in actor has no permission for. */
  disabled?: boolean;
};

export type ConsoleNavProps = {
  items: ConsoleNavItem[];
  /** Key of the section currently open. */
  active: string;
  backHref: string;
  backLabel?: string;
  className?: string;
};

export function ConsoleNav({
  items,
  active,
  backHref,
  backLabel = "← Back to site",
  className,
}: ConsoleNavProps) {
  return (
    <nav
      aria-label="Console"
      // A row below lg (the console's strip), the column from lg up.
      className={cx("flex items-center gap-[3px] lg:flex-col lg:items-stretch", className)}
    >
      <a
        href={backHref}
        className="mr-2 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg lg:mr-0 lg:mb-2.5"
      >
        {backLabel}
      </a>

      {items.map((item) =>
        item.disabled ? (
          <span
            key={item.key}
            aria-disabled="true"
            className="shrink-0 cursor-not-allowed whitespace-nowrap rounded-[7px] px-2.5 py-[7px] text-[13px] text-dim opacity-50"
          >
            {item.label}
          </span>
        ) : (
          <a
            key={item.key}
            href={item.href}
            aria-current={item.key === active ? "page" : undefined}
            className={cx(
              "shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-[7px] text-[13px] no-underline transition-colors duration-150",
              item.key === active
                ? "bg-accent-soft font-semibold text-accent"
                : "text-muted hover:text-fg",
            )}
          >
            {item.label}
          </a>
        ),
      )}
    </nav>
  );
}
