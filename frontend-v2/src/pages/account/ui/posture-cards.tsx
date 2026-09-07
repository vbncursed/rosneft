import { Badge, type BadgeProps } from "@/shared/ui/badge";
import type { PostureCard, PostureTone } from "../model/posture";

export type PostureCardsProps = { cards: PostureCard[] };

const BADGE_TONE: Record<PostureTone, NonNullable<BadgeProps["tone"]>> = {
  ok: "ok",
  neutral: "neutral",
  dim: "dim",
};

/** The three cards across the top of the account screen: 2FA, passkeys, password. */
export function PostureCards({ cards }: PostureCardsProps) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[11px] border border-line bg-panel px-[18px] py-4">
          <div className="flex items-center justify-between gap-2.5">
            <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{card.label}</p>
            <Badge tone={BADGE_TONE[card.tone]} size="sm">
              {card.badge}
            </Badge>
          </div>
          <p className="m-0 mt-3 font-mono text-[22px] leading-none text-fg">{card.value}</p>
          <p className="m-0 mt-1.5 text-[11px] leading-[1.45] text-muted">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
