import { clsx as cx } from "clsx";

/** How someone came by their access to a territory. */
export type AccessVia = "direct" | "role";

export type AccessRowProps = {
  slug: string;
  via: AccessVia;
};

const LABEL: Record<AccessVia, string> = {
  direct: "direct",
  role: "via role",
};

/** One territory a person can reach, and how. */
export function AccessRow({ slug, via }: AccessRowProps) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-control border border-line bg-panel-2 px-3 py-2">
      <span className="font-mono text-[11px] text-fg">{slug}</span>
      <span
        className={cx(
          "font-mono text-[9px] uppercase tracking-[0.14em]",
          via === "direct" ? "text-accent" : "text-muted",
        )}
      >
        {LABEL[via]}
      </span>
    </div>
  );
}
