import { clsx as cx } from "clsx";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { grantLabel, grantShare, usersLabel, type Role, type RoleTone } from "../model/role";

export type RoleChipTone = "grant" | "strong" | "locked";

export type RoleCardChip = {
  label: string;
  tone?: RoleChipTone;
};

export type RoleCardProps = {
  role: Role;
  /** Size of the whole permission set, so the meter has a denominator. */
  totalPermissions: number;
  tone?: RoleTone;
  /** Right of the title — "owner", "system", "editing", or nothing. */
  tag?: string;
  tagTone?: "accent" | "dim";
  /** A few representative grants. */
  chips?: RoleCardChip[];
  /** Usernames whose initials stack in the footer; at most a handful. */
  faces?: string[];
  selected?: boolean;
  onSelect?: () => void;
};

const RAIL: Record<RoleTone, string> = {
  accent: "bg-accent",
  warn: "bg-warn",
  ok: "bg-ok",
  neutral: "bg-line-2",
};

const CHIP: Record<RoleChipTone, { tone: "neutral" | "accent" | "dim"; fill: "soft" | "outline" }> = {
  grant: { tone: "neutral", fill: "soft" },
  strong: { tone: "accent", fill: "soft" },
  locked: { tone: "dim", fill: "outline" },
};

export function RoleCard({
  role,
  totalPermissions,
  tone = "neutral",
  tag,
  tagTone = "dim",
  chips = [],
  faces = [],
  selected = false,
  onSelect,
}: RoleCardProps) {
  return (
    <article
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={role.title}
      className={cx(
        "relative cursor-pointer overflow-hidden rounded-card border py-4 pl-5 pr-4 transition-colors duration-150",
        selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cx("absolute inset-y-0 left-0 w-[3px]", RAIL[tone], !selected && "opacity-50")}
      />

      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-semibold text-fg">{role.title}</p>
          <p className="m-0 mt-[3px] font-mono text-[10px] text-muted">{role.slug}</p>
        </div>
        {tag ? (
          <span
            className={cx(
              "whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.16em]",
              tagTone === "accent" ? "text-accent" : "text-dim",
            )}
          >
            {tag}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <ProgressBar
          variant="thin"
          className="min-w-0 flex-1"
          value={grantShare(role, totalPermissions)}
          ariaLabel={`${role.title} permissions granted`}
        />
        <span className="whitespace-nowrap font-mono text-[10px] text-muted">
          {grantLabel(role, totalPermissions)}
        </span>
      </div>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip.label} shape="chip" {...CHIP[chip.tone ?? "grant"]}>
              {chip.label}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <div className="flex items-center">
          {faces.map((name, index) => (
            // Overlapped, as a stack of who holds the role rather than a list.
            <Avatar
              key={name}
              name={name}
              size={24}
              variant={index === 0 && tone === "accent" ? "soft" : "plain"}
              className="-mr-1.5 text-[9px]"
            />
          ))}
          <span className={cx("font-mono text-[10px] text-dim", faces.length > 0 && "ml-3.5")}>
            {usersLabel(role)}
          </span>
        </div>
        <span className="font-mono text-[10px] text-dim">{role.updated}</span>
      </div>
    </article>
  );
}
