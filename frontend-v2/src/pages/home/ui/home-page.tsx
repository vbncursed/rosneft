import type { AuditEntry } from "@/entities/audit";
import type { JobCardModel } from "@/entities/conversion";
import type { ModelCardModel } from "@/entities/model";
import type { TerritoryCardModel } from "@/entities/territory";
import { ThemeToggle } from "@/features/theme-toggle";
import { AccountPill } from "@/widgets/account-pill";
import { PageHeader } from "@/widgets/page-header";
import { ActivitySection } from "./activity-section";
import type { ConsoleCardProps } from "./console-card";
import { ConsoleSection } from "./console-section";
import { JobsSection } from "./jobs-section";
import { ModelsSection } from "./models-section";
import { TerritoriesSection } from "./territories-section";

export type HomePageProps = {
  meta: string;
  viewer: { username: string; roleTitle: string };
  jobs: JobCardModel[];
  jobsMeta: string;
  territories: { cards: TerritoryCardModel[]; total: number; meta: string; viewerEmpty: boolean };
  /** null hides the section (the viewer-empty state). */
  models: { cards: ModelCardModel[]; total: number; meta: string } | null;
  /** null hides the section (no console screen at all). */
  console: ConsoleCardProps[] | null;
  activity: AuditEntry[] | null;
  activityLoading: boolean;
  /** Whole-card open; the title anchor routes itself through the shell's delegate. */
  onOpen: (href: string) => void;
};

/** The landing screen: what is converting, what you can open, and what you did. */
export function HomePage(p: HomePageProps) {
  return (
    <>
      <PageHeader
        size="xl"
        eyebrow="Andrey Viewer"
        title="Territories and models"
        meta={p.meta}
        action={
          <div className="flex flex-wrap items-center gap-[9px]">
            <ThemeToggle variant="compact" />
            <AccountPill {...p.viewer} />
          </div>
        }
      />
      <JobsSection jobs={p.jobs} meta={p.jobsMeta} />
      <TerritoriesSection {...p.territories} onOpen={p.onOpen} />
      {p.models ? <ModelsSection {...p.models} onOpen={p.onOpen} /> : null}
      {p.console ? <ConsoleSection cards={p.console} /> : null}
      <ActivitySection entries={p.activity} loading={p.activityLoading} />
    </>
  );
}
