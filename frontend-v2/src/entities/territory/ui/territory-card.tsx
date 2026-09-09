import type { ReactNode } from "react";
import type { ConversionStatus } from "@/entities/conversion";
import { CatalogCard, type CatalogTone } from "@/shared/ui/catalog-card";
import type { TerritoryCardModel } from "../model/territory-card";

export type TerritoryCardProps = {
  card: TerritoryCardModel;
  /** Where the title points; the shell's click delegate keeps it in the SPA. */
  href: string;
  /** Whole-card click. */
  onOpen?: () => void;
  /** Top-right overlay controls — the catalog's replace/delete buttons. */
  actions?: ReactNode;
};

const TONE: Record<ConversionStatus, CatalogTone> = {
  ready: "neutral",
  pending: "neutral",
  converting: "warn",
  failed: "bad",
};

const BADGE: Partial<Record<ConversionStatus, { label: string; tone: "ok" | "warn" | "bad" }>> = {
  ready: { label: "ready", tone: "ok" },
  converting: { label: "converting", tone: "warn" },
  failed: { label: "failed", tone: "bad" },
};

/** How a territory looks in a grid — the catalog's card, one geometry everywhere. */
export function TerritoryCard({ card, href, onOpen, actions }: TerritoryCardProps) {
  return (
    <CatalogCard
      title={card.title}
      description={card.description}
      slug={card.slug}
      tone={TONE[card.status]}
      badge={BADGE[card.status]}
      chips={card.chips}
      progress={card.progress}
      trailing={card.trailing}
      onOpen={onOpen}
      href={href}
      actions={actions}
    />
  );
}
