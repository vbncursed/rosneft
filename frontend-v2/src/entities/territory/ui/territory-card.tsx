import type { ReactNode } from "react";
import { ConversionBadge, trailingNote, isOpenable, type ConversionState } from "@/entities/conversion";
import { CatalogCard } from "@/shared/ui/catalog-card";
import { territoryPath, type Territory } from "../model/territory";

export type TerritoryCardProps = {
  territory: Territory;
  conversion: ConversionState;
  /** Replace / Delete, shown in place of the status badge. */
  actions?: ReactNode;
  highlighted?: boolean;
};

/** How a territory looks in the catalog — one place, so every list agrees. */
export function TerritoryCard({
  territory,
  conversion,
  actions,
  highlighted,
}: TerritoryCardProps) {
  const open = isOpenable(conversion);

  return (
    <CatalogCard
      kind="Territory"
      title={territory.title}
      description={territory.description}
      slug={territory.slug}
      href={open ? territoryPath(territory.slug) : undefined}
      badge={<ConversionBadge status={conversion.status} />}
      actions={actions}
      trailing={trailingNote(conversion)}
      muted={!open}
      highlighted={highlighted}
    />
  );
}
