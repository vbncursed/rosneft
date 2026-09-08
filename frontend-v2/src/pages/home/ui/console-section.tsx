import { SectionHeading } from "@/shared/ui/section-heading";
import { ConsoleCard, type ConsoleCardProps } from "./console-card";

export type ConsoleSectionProps = { cards: ConsoleCardProps[] };

/** The doorways into company administration — one card per console screen. */
export function ConsoleSection({ cards }: ConsoleSectionProps) {
  return (
    <section aria-label="Console">
      <SectionHeading title="Console" count="company administration" className="pb-3 pt-0.5" />
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {cards.map((card) => (
          <ConsoleCard key={card.href} {...card} />
        ))}
      </div>
    </section>
  );
}
