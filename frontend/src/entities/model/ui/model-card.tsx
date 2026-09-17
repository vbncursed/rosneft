import type { ReactNode } from "react";
import type { ConversionStatus } from "@/entities/conversion";
import { CatalogCard, type CatalogTone } from "@/shared/ui/catalog-card";
import type { ModelCardModel } from "../model/model-card";

export type ModelCardProps = {
  card: ModelCardModel;
  href: string;
  onOpen?: () => void;
  /** The footer's plain right-hand text — the library passes the size; Home passes none. */
  meta?: string;
  actions?: ReactNode;
};

const TONE: Record<ConversionStatus, CatalogTone> = {
  ready: "neutral",
  pending: "neutral",
  converting: "warn",
  failed: "bad",
};

// Only a live or stopped conversion earns a badge — a ready or pending model
// already says everything it needs to through its trailing note.
const BADGE: Partial<Record<ConversionStatus, { label: string; tone: "warn" | "bad" }>> = {
  converting: { label: "converting", tone: "warn" },
  failed: { label: "failed", tone: "bad" },
};

/** How a model looks in a grid — the library's card, one geometry everywhere. */
export function ModelCard({ card, href, onOpen, meta, actions }: ModelCardProps) {
  return (
    <CatalogCard
      size="sm"
      title={card.title}
      slug={card.slug}
      tone={TONE[card.status]}
      badge={BADGE[card.status]}
      thumbnailUrl={card.thumbnailUrl ?? undefined}
      noImageLabel={card.thumbnailUrl ? undefined : "no image"}
      meta={meta}
      trailing={card.trailing}
      onOpen={onOpen}
      href={href}
      actions={actions}
    />
  );
}
