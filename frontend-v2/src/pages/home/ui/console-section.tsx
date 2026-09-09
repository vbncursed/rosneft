import { SectionHeading } from "@/shared/ui/section-heading";
import { ConsoleCard, type ConsoleCardProps } from "./console-card";
import { TrailingLink } from "./trailing-link";

export type ConsoleSectionProps = { cards: ConsoleCardProps[] };

/** The doorways into company administration — one card per console screen. */
export function ConsoleSection({ cards }: ConsoleSectionProps) {
  return (
    <section aria-label="Console">
      <SectionHeading
        title="Console"
        count="company administration"
        className="pb-3 pt-0.5"
        trailing={<TrailingLink href="/console">Console →</TrailingLink>}
      />
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {cards.map((card) => (
          <ConsoleCard key={card.href} {...card} />
        ))}
      </div>
    </section>
  );
}
