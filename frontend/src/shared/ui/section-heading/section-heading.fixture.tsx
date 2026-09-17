import { SectionHeading } from "./section-heading";

export default (
  <div className="flex max-w-lg flex-col gap-5 rounded-card border border-line bg-panel p-6">
    <SectionHeading title="Field operators" count="11 people" />
    <SectionHeading title="Today · 1 September" count="312 events" />
    <SectionHeading title="Guests" />
    <SectionHeading
      title="Territories"
      count="showing 4 of 12"
      trailing={
        <a href="#" className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent no-underline">
          See all 12 territories →
        </a>
      }
    />
  </div>
);
