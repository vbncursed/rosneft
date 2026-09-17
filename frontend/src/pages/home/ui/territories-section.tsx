import { TerritoryCard, territoryPath, type TerritoryCardModel } from "@/entities/territory";
import { EmptyState } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";
import { seeAll } from "../model/home-view";
import { TrailingLink } from "./trailing-link";

export type TerritoriesSectionProps = {
  cards: TerritoryCardModel[];
  total: number;
  meta: string;
  /** Nothing is assigned and nothing can be uploaded — a different sentence entirely. */
  viewerEmpty: boolean;
  onOpen: (href: string) => void;
};

export function TerritoriesSection({
  cards,
  total,
  meta,
  viewerEmpty,
  onOpen,
}: TerritoriesSectionProps) {
  return (
    <section aria-label="Territories">
      <SectionHeading
        title="Territories"
        count={meta}
        className="pb-3 pt-0.5"
        trailing={
          total > 0 ? (
            <TrailingLink href="/territories">{seeAll("territories", total)}</TrailingLink>
          ) : undefined
        }
      />
      {cards.length === 0 ? (
        viewerEmpty ? (
          <EmptyState
            layout="start"
            title="No territories are assigned to you yet"
            description="Access is granted per territory. Ask your company owner to assign one — it will appear here as soon as they do."
          />
        ) : (
          <EmptyState
            layout="start"
            title="No territories yet"
            description="Upload a source archive from the territory catalog and the first one will appear here."
          />
        )
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {cards.map((card) => (
            <TerritoryCard
              key={card.slug}
              card={card}
              href={territoryPath(card.slug)}
              onOpen={() => onOpen(territoryPath(card.slug))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
