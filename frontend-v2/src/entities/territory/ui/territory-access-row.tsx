import { clsx as cx } from "clsx";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { VISIBILITY_TONE, type TerritoryAccess } from "../model/access";

export type TerritoryAccessRowProps = {
  territory: TerritoryAccess;
  selected?: boolean;
  onManage: () => void;
};

const RAIL = {
  assigned: "bg-accent",
  company: "bg-ok",
  private: "bg-line-2",
} as const;

/** One territory in the access list: who can open it, and a way in to change that. */
export function TerritoryAccessRow({
  territory,
  selected = false,
  onManage,
}: TerritoryAccessRowProps) {
  return (
    <article
      onClick={onManage}
      aria-current={selected ? "true" : undefined}
      aria-label={territory.title}
      className={cx(
        "relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-[11px] border py-3.5 pl-4.5 pr-4 transition-colors duration-150",
        selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "absolute inset-y-0 left-0 w-[3px]",
          RAIL[territory.visibility],
          !selected && "opacity-50",
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="min-w-0 truncate text-[13px] font-semibold text-fg">
            {territory.title}
          </span>
          <Badge
            shape="tag"
            size="sm"
            fill="outline"
            tone={VISIBILITY_TONE[territory.visibility]}
            className="tracking-[0.12em]"
          >
            {territory.visibility}
          </Badge>
        </div>
        <p className="m-0 mt-[5px] truncate font-mono text-[10px] text-muted">{territory.meta}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3.5">
        <div className="flex items-center">
          {territory.faces.map((name, index) => (
            <Avatar
              key={name}
              name={name}
              size={24}
              variant={index === 0 && territory.visibility !== "private" ? "soft" : "plain"}
              className="-mr-1.5 text-[9px]"
            />
          ))}
          <span
            className={cx(
              "w-[74px] font-mono text-[10px] text-dim",
              territory.faces.length > 0 && "ml-2.5",
            )}
          >
            {territory.peopleLabel}
          </span>
        </div>

        <Button
          shape="pill"
          size="sm"
          variant={selected ? "accent" : "secondary"}
          // Several rows are on screen; "Manage" alone names none of them.
          aria-label={`Manage access to ${territory.title}`}
          className="font-sans text-xs normal-case tracking-normal"
        >
          Manage
        </Button>
      </div>
    </article>
  );
}
