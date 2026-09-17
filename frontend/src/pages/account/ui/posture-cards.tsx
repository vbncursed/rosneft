import { Badge } from "@/shared/ui/badge";
import { Skeleton } from "@/shared/ui/skeleton";
import type { PostureCard } from "../model/posture";

export type PostureCardsProps = {
  cards: PostureCard[];
  /** Still in flight for that card's own query — draws a skeleton, never a confident value. */
  twoFactorLoading?: boolean;
  passkeysLoading?: boolean;
};

/** The three cards across the top of the account screen: 2FA, passkeys, password. */
export function PostureCards({ cards, twoFactorLoading = false, passkeysLoading = false }: PostureCardsProps) {
  // Keyed by label, not position: postureCards' order is a documented
  // convention, not a contract this component should rely on — reorder or
  // filter that function and an index-based lookup would silently land the
  // skeleton on the wrong card. Password never has a query of its own, so it
  // is absent here rather than hardcoded false.
  const loadingByLabel: Record<string, boolean> = {
    "Two-factor": twoFactorLoading,
    Passkeys: passkeysLoading,
  };

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {cards.map((card) => {
        const loading = loadingByLabel[card.label] ?? false;
        return (
          <div
            key={card.label}
            aria-busy={loading || undefined}
            className="rounded-[11px] border border-line bg-panel px-[18px] py-4"
          >
            <div className="flex items-center justify-between gap-2.5">
              <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{card.label}</p>
              {/* Suppressed while loading: a badge reading "unknown" next to
                  a pulsing bar is a confident answer about a card that has
                  none yet. The Password badge, when shown, is muted
                  border+colour over a transparent ground, not the tinted
                  fill the other two use. */}
              {loading ? null : (
                <Badge tone={card.tone} fill={card.tone === "neutral" ? "outline" : "soft"} size="sm">
                  {card.badge}
                </Badge>
              )}
            </div>
            {loading ? (
              <Skeleton height="22px" width="60%" className="mt-3" />
            ) : (
              <p className="m-0 mt-3 font-mono text-[22px] leading-none text-fg">{card.value}</p>
            )}
            <p className="m-0 mt-1.5 text-[11px] leading-[1.45] text-muted">{card.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
