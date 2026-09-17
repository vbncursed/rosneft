import { ModelCard, modelPath, type ModelCardModel } from "@/entities/model";
import { EmptyState } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";
import { seeAll } from "../model/home-view";
import { TrailingLink } from "./trailing-link";

export type ModelsSectionProps = {
  cards: ModelCardModel[];
  total: number;
  meta: string;
  onOpen: (href: string) => void;
};

export function ModelsSection({ cards, total, meta, onOpen }: ModelsSectionProps) {
  return (
    <section aria-label="Models">
      <SectionHeading
        title="Models"
        count={meta}
        className="pb-3 pt-0.5"
        trailing={
          total > 0 ? (
            <TrailingLink href="/models">{seeAll("models", total)}</TrailingLink>
          ) : undefined
        }
      />
      {cards.length === 0 ? (
        <EmptyState
          layout="start"
          title="The library is empty"
          description="Models uploaded here can be placed on any territory."
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {cards.map((card) => (
            <ModelCard
              key={card.slug}
              card={card}
              href={modelPath(card.slug)}
              onOpen={() => onOpen(modelPath(card.slug))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
