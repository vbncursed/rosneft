import { clsx as cx } from "clsx";
import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/badge";
import { Icon } from "@/shared/ui/icon";
import { ProgressBar } from "@/shared/ui/progress-bar";

export type CatalogTone = "neutral" | "warn" | "bad";
export type CatalogChip = { label: string; tone: "plain" | "accent" | "ok" | "warn" };

export type CatalogCardProps = {
  title: string;
  description?: string;
  slug: string;
  /** Border colour — neutral (line) / warn (converting) / bad (failed). */
  tone?: CatalogTone;
  /** Top-left status pill. */
  badge?: { label: string; tone: "ok" | "warn" | "bad" };
  /** Else the cube glyph is drawn on the grid background. */
  thumbnailUrl?: string;
  noImageLabel?: string;
  /** Top-right overlay controls; clicks inside never reach onOpen. */
  actions?: ReactNode;
  chips?: CatalogChip[];
  /** 0–100, drawn as a warn bar with its stage line underneath. */
  progress?: { value: number; stage: string };
  trailing: { label: string; tone: "accent" | "muted" | "warn" | "bad" };
  /** Whole-card click when the target is openable. */
  onOpen?: () => void;
  /** md = Territory Catalog, sm = Model Library. */
  size?: "md" | "sm";
  className?: string;
};

const TONE: Record<CatalogTone, string> = {
  neutral: "border-line",
  warn: "border-warn",
  bad: "border-bad",
};

const TRAILING: Record<CatalogCardProps["trailing"]["tone"], string> = {
  accent: "text-accent",
  muted: "text-muted",
  warn: "text-warn",
  bad: "text-bad",
};

const CHIP: Record<CatalogChip["tone"], { tone: "neutral" | "accent" | "ok" | "warn"; fill: "soft" | "outline" }> = {
  plain: { tone: "neutral", fill: "soft" },
  accent: { tone: "accent", fill: "soft" },
  ok: { tone: "ok", fill: "outline" },
  warn: { tone: "warn", fill: "outline" },
};

/** How a territory or model looks in its catalog grid — the design's card, rebuilt to the v2 mock. */
export function CatalogCard({
  title,
  description,
  slug,
  tone = "neutral",
  badge,
  thumbnailUrl,
  noImageLabel,
  actions,
  chips,
  progress,
  trailing,
  onOpen,
  size = "md",
  className,
}: CatalogCardProps) {
  const sm = size === "sm";
  const titleClass = cx(
    "m-0 font-semibold",
    sm ? "truncate text-[14px] tracking-[-0.01em]" : "text-[18px] tracking-[-0.015em]",
  );

  return (
    <article
      aria-label={title}
      onClick={onOpen}
      className={cx(
        "overflow-hidden border bg-panel",
        TONE[tone],
        onOpen && "cursor-pointer",
        sm ? "rounded-[12px]" : "rounded-[14px]",
        className,
      )}
    >
      <div
        className="relative flex h-[132px] items-center justify-center border-b border-line bg-panel-2"
        style={
          thumbnailUrl
            ? undefined
            : {
                backgroundImage:
                  "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
                backgroundSize: sm ? "22px 22px" : "24px 24px",
              }
        }
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="size-full object-cover" />
        ) : noImageLabel ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {noImageLabel}
          </span>
        ) : (
          <Icon name="cube" size={sm ? 46 : 34} className="text-dim" />
        )}
        {badge ? (
          <Badge tone={badge.tone} shape="pill" size="sm" className="absolute left-3 top-3">
            {badge.label}
          </Badge>
        ) : null}
        {actions ? (
          <div className="absolute right-2.5 top-2.5 flex gap-1.5" onClick={(event) => event.stopPropagation()}>
            {actions}
          </div>
        ) : null}
      </div>

      <div
        className={cx(
          "flex flex-col",
          sm ? "gap-2.5 px-[15px] pb-[15px] pt-[13px]" : "gap-3 px-[18px] pb-[18px] pt-4",
        )}
      >
        <h3 className={titleClass}>
          {onOpen ? (
            <button
              type="button"
              onClick={(event) => {
                // The article's own onClick handles the rest of the card;
                // without this the click would bubble there too and fire
                // onOpen twice.
                event.stopPropagation();
                onOpen();
              }}
              className="m-0 border-0 bg-transparent p-0 text-left [font:inherit] hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {title}
            </button>
          ) : (
            title
          )}
        </h3>

        {description ? <p className="m-0 text-[13px] leading-[1.55] text-muted">{description}</p> : null}

        {chips && chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip, index) => {
              const { tone: chipTone, fill } = CHIP[chip.tone];
              return (
                <Badge key={`${chip.label}-${index}`} tone={chipTone} fill={fill} shape="chip">
                  {chip.label}
                </Badge>
              );
            })}
          </div>
        ) : null}

        {progress ? (
          <div>
            <ProgressBar
              value={progress.value}
              tone="warn"
              variant="framed"
              className="[&>div]:h-1"
              ariaLabel={progress.stage}
            />
            <p className="mt-[7px] font-mono text-[10px] text-warn">{progress.stage}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2.5 border-t border-line pt-3">
          <span className="truncate font-mono text-[11px] text-muted">{slug}</span>
          <span
            className={cx(
              "whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em]",
              TRAILING[trailing.tone],
            )}
          >
            {trailing.label}
          </span>
        </div>
      </div>
    </article>
  );
}
