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
      className={cx("flex flex-col gap-[3px]", className)}
    >
      <a
        href={backHref}
        className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg"
      >
        {backLabel}
      </a>
      <p className="m-0 mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
        Console
      </p>

      {items.map((item) =>
        item.disabled ? (
          <span
            key={item.key}
            aria-disabled="true"
            className="cursor-not-allowed rounded-[7px] px-2.5 py-[7px] text-[13px] text-dim opacity-50"
          >
            {item.label}
          </span>
        ) : (
          <a
            key={item.key}
            href={item.href}
            aria-current={item.key === active ? "page" : undefined}
            className={cx(
              "rounded-[7px] px-2.5 py-[7px] text-[13px] no-underline transition-colors duration-150",
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
